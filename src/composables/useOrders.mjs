import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { UUID, orderAttempt, defaultPayMethod } from '../../shared/create-core.mjs';

export function useOrders(session) {
  const { t, request, action, user, verified, busy, scope, failure, money } = session;
  const plans = ref([]),
    orders = ref([]),
    pendingOrder = ref(null),
    status = ref(''),
    ordersStatus = ref(''),
    page = ref(0),
    panel = ref();
  const feedback = ref({}),
    pageSize = 5;
  let expiryTimer, queryTimer;
  const attempts = new Map();
  const visibleOrders = computed(() =>
    orders.value.slice(page.value * pageSize, (page.value + 1) * pageSize),
  );
  const totalPages = computed(() => Math.ceil(orders.value.length / pageSize));
  function orderLabel(order) {
    return order.status === 'paid' &&
      order.delivery?.mode === 'auto_redeem' &&
      order.delivery.creditsGranted > 0
      ? t('account.delivered', { count: order.delivery.creditsGranted })
      : t(
          { pending: 'account.pending', paid: 'account.paid', closed: 'account.closed' }[order.status] ||
            'account.unknown',
        );
  }
  function valid(order) {
    if (!UUID.test(order?.id)) throw failure('account.invalidOrder');
    return order;
  }
  function eligible(order) {
    return (
      (order.status === 'pending' ||
        (order.status === 'paid' &&
          !(order.delivery?.mode === 'auto_redeem' && order.delivery.creditsGranted > 0))) &&
      Date.parse(order.createdAt) + 600_000 > Date.now() &&
      (attempts.get(order.id) || 0) < 120
    );
  }
  function schedule() {
    clearTimeout(expiryTimer);
    clearTimeout(queryTimer);
    const now = Date.now();
    orders.value = orders.value.filter(
      (order) =>
        order.status !== 'pending' ||
        !Number.isFinite(Date.parse(order.createdAt)) ||
        Date.parse(order.createdAt) + 600_000 > now,
    );
    page.value = Math.min(page.value, Math.max(0, totalPages.value - 1));
    const deadlines = orders.value
      .filter((order) => order.status === 'pending')
      .map((order) => Date.parse(order.createdAt) + 600_000)
      .filter(Number.isFinite);
    if (deadlines.length) expiryTimer = setTimeout(schedule, Math.max(1, Math.min(...deadlines) - now));
    if (user.value && !document.hidden && orders.value.some(eligible))
      queryTimer = setTimeout(pollOrders, 3000);
  }
  function save(order, first = false) {
    valid(order);
    const index = orders.value.findIndex((item) => item.id === order.id);
    if (first) orders.value = [order, ...orders.value.filter((item) => item.id !== order.id)];
    else if (index >= 0) orders.value[index] = order;
    else orders.value.unshift(order);
    schedule();
  }
  function loadPlans() {
    return action('plans', status, async (ticket) => {
      status.value = t('account.plansLoading');
      const data = await request(ticket, '/plans');
      if (
        !Array.isArray(data) ||
        !data.every(
          (item) =>
            UUID.test(item.id) &&
            typeof item.title === 'string' &&
            Number.isSafeInteger(item.credits) &&
            item.credits > 0,
        )
      )
        throw failure('account.invalidPlans');
      data.forEach((item) => money(item.priceMinor, item.currency));
      plans.value = data;
      status.value = data.length ? '' : t('account.noPlans');
    });
  }
  function loadOrders() {
    return action('orders', ordersStatus, async (ticket) => {
      const data = await request(ticket, '/orders');
      if (data !== null && !Array.isArray(data)) throw failure('account.invalidOrders');
      orders.value = (data || []).map(valid);
      ordersStatus.value = '';
      schedule();
    });
  }
  async function submit(ticket) {
    status.value = t('account.ordering');
    const order = valid(await request(ticket, '/orders', pendingOrder.value));
    pendingOrder.value = null;
    page.value = 0;
    save(order, true);
    status.value = '';
    panel.value.open = true;
    await nextTick();
    const element = document.querySelector(`[data-order-id="${order.id}"]`);
    if (element) {
      element.tabIndex = -1;
      element.focus({ preventScroll: true });
      element.scrollIntoView({
        block: 'center',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
  }
  function buy(plan) {
    if (!verified.value || pendingOrder.value || busy.has('orders')) return;
    pendingOrder.value = orderAttempt(plan.id, defaultPayMethod(matchMedia('(max-width: 700px)').matches));
    return action('orders', status, submit);
  }
  async function refreshPayment(id) {
    feedback.value[id] = t('account.gettingPayment');
    const result = ref('');
    await action('orders', result, async (ticket) => {
      save(await request(ticket, `/orders/${id}/payment`, {}));
      feedback.value[id] = t('account.paymentUpdated');
      await session.refreshBalance(ticket);
    });
    if (result.value) feedback.value[id] = result.value;
  }
  async function pollOrders() {
    if (!user.value || document.hidden) return;
    if (busy.has('orders')) {
      schedule();
      return;
    }
    const ticket = scope.capture();
    busy.add('orders');
    let changed = false;
    try {
      for (const previous of orders.value.filter(eligible)) {
        if (document.hidden) break;
        attempts.set(previous.id, (attempts.get(previous.id) || 0) + 1);
        try {
          const order = valid(await request(ticket, `/orders/${previous.id}/details`, {}));
          changed ||= orderLabel(previous) !== orderLabel(order);
          const index = orders.value.findIndex((item) => item.id === order.id);
          if (index >= 0) orders.value[index] = order;
        } catch (cause) {
          if (!scope.current(ticket) || cause.name === 'AbortError') return;
          if (cause.status === 401) {
            session.reset();
            session.status.value = t('http.s401');
            return;
          }
        }
      }
      if (changed) await session.refreshBalance(ticket);
    } catch (cause) {
      if (scope.current(ticket)) ordersStatus.value = session.error(cause);
    } finally {
      if (scope.current(ticket)) {
        busy.delete('orders');
        schedule();
      }
    }
  }
  function reset() {
    clearTimeout(expiryTimer);
    clearTimeout(queryTimer);
    attempts.clear();
    orders.value = [];
    pendingOrder.value = null;
    page.value = 0;
    feedback.value = {};
    status.value = '';
    ordersStatus.value = '';
    if (panel.value) panel.value.open = false;
  }
  session.resets.add(reset);
  watch(user, (value) => {
    if (value) {
      void action('balance', session.status, (ticket) => session.refreshBalance(ticket));
      void loadOrders();
    }
  });
  onMounted(() => {
    void loadPlans();
    document.addEventListener('visibilitychange', schedule);
  });
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', schedule);
    session.resets.delete(reset);
    reset();
  });
  return {
    plans,
    orders,
    pendingOrder,
    status,
    ordersStatus,
    page,
    panel,
    feedback,
    visibleOrders,
    totalPages,
    orderLabel,
    loadPlans,
    loadOrders,
    buy,
    retryOrder: () => pendingOrder.value && action('orders', status, submit),
    refreshPayment,
  };
}
