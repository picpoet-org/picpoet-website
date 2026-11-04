import { createAPI, createScope, errorMessage, prepareImage, generationAttempt, generationForm, orderAttempt, safePaymentURL, orderStatus, pollGeneration, UUID, staleError } from './create-core.mjs';
import { poemData, renderPoemCard } from './poem-card.mjs';
import { mountHistory } from './history.mjs';
import { paymentQR } from './payment-qr.mjs';
import { mountWaitingPoems } from './waiting-poems.mjs';
export * from './create-core.mjs';
import { safeReturnTo, loginDestination } from './user-navigation.mjs';

export function mountCreatePage(doc = document) {
  const $ = id => doc.getElementById(id);
  const pageName = doc.body.dataset.userPage || 'legacy';
  const isCreate = !!$('create-form'), isAuth = !!$('auth-form'), isAccount = !!$('purchase');
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const api = createAPI();
  const scope = createScope();
  const pollScope = createScope();
  const waitingPoems = mountWaitingPoems($('generation-status'));
  const busy = new Set();
  let ready = false, user = null, image = null, photoURL = '', cardURL = '', cardBlob = null, polling = false;
  let task = null, poem = null, pendingOrder = null, plans = [], orders = [], imageVersion = 0;
  const orderPageSize = 5;
  let orderPage = 0;
  let orderExpiryTimer;
  let orderQueryTimer;
  const orderQueryAttempts = new Map();
  const text = (id, value) => { if ($(id)) $(id).textContent = value; };
  const show = (id, yes) => { if ($(id)) $(id).hidden = !yes; };
  const verified = () => user?.emailVerified === true;
  const announce = (message, id = 'page-status') => {
    text(id, message);
    show(id, !!message);
  };
  const history = $('history') ? mountHistory({ doc, api, scope, loggedIn: () => !!user, onUnauthorized: () => {
    resetAccount(); announce(errorMessage({ status: 401 })); showLogin();
  } }) : { reset() {}, refresh() {} };
  function showLogin() {
    show('login-gate', true);
    if ($('login-link')) $('login-link').href = loginDestination(pageName + '.html', location.hash);
    if (isAuth) $('email').focus();
  }
  function revokePhoto() {
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = ''; $('photo')?.removeAttribute('src'); show('photo-preview', false);
  }
  function clearCard() {
    if (cardURL) URL.revokeObjectURL(cardURL);
    cardURL = ''; cardBlob = null;
    $('poem-card')?.removeAttribute('src'); $('download-card')?.removeAttribute('href');
    show('card-preview', false); show('download-card', false); show('share-card', false);
  }
  function clearResult() {
    clearCard(); poem = null;
    for (const id of ['poem-title', 'poem-cipai', 'poem-body', 'result-expiry', 'card-status']) text(id, '');
    show('result-content', false); show('result-empty', true);
  }
  function sync() {
    const authBusy = busy.has('auth');
    const orderBusy = busy.has('orders');
    if (isAuth) {
    const registering = $('auth-mode').value === 'register';
    for (const [id, selected] of [['mode-login', !registering], ['mode-register', registering]]) {
      $(id).setAttribute('aria-pressed', String(selected));
      $(id).disabled = !ready || authBusy || busy.has('verify');
    }
    text('auth-submit', authBusy ? (registering ? '正在注册…' : '正在登录…') : (registering ? '注册并发送验证码' : '登录并开始创作'));
    text('password-help', registering ? '至少 8 位，支持粘贴和密码管理器。' : '使用已有 Picpoet 账户登录。');
    $('auth-form').setAttribute('aria-busy', String(authBusy));
    $('verify-form').setAttribute('aria-busy', String(busy.has('verify')));
    show('verify-panel', !verified());
    show('auth-panel', !user); show('account-summary', !!user); show('logout', !!user);
    $('auth-fields').disabled = !ready || authBusy || busy.has('verify');
    $('verify-fields').disabled = !ready || authBusy || busy.has('verify');
    $('logout').disabled = authBusy;
    }
    show('account-summary', !!user); show('logout', !!user);
    if ($('logout')) $('logout').disabled = authBusy;
    show('login-gate', ready && (!user || !verified()) && !isAuth);
    text('account-name', user ? `${user.email} · ${verified() ? '邮箱已验证' : '邮箱待验证'}` : '');
    if (pageName === 'account') {
      text('account-name', user?.email || '');
      text('account-verification', user ? (verified() ? '已验证' : '待验证') : '');
    }
    if ($('refresh-balance')) $('refresh-balance').disabled = !user || busy.has('balance');
    if (isCreate) {
    text('generate', busy.has('image') ? '正在处理照片…' : busy.has('task') ? '创作进行中…' : '生成诗词');
    show('task-details', !!task);
    $('generation-inputs').disabled = !verified() || !!task || busy.has('image') || authBusy;
    $('generate').disabled = !image || !verified() || !!task || busy.has('image');
    const taskBusy = busy.has('task');
    show('stop-poll', !!task && polling);
    show('resume-generation', !!task && !taskBusy);
    show('retry-generation', !!task?.attempt && !taskBusy && !task.terminal);
    show('new-generation', !!task?.terminal && !taskBusy);
    $('new-generation').disabled = busy.has('card');
    $('redraw-card').disabled = busy.has('card');
    $('share-card').disabled = busy.has('share');
    }
    if (isAccount) {
    if ($('pay-method')) $('pay-method').disabled = !!pendingOrder || orderBusy;
    $('refresh-orders').disabled = !user || orderBusy;
    const pages = Math.ceil(orders.length / orderPageSize);
    show('orders-pagination', !!user && pages > 1);
    text('orders-page', orders.length ? `${orderPage + 1} / ${pages}` : '');
    if ($('orders-prev')) $('orders-prev').disabled = !user || orderBusy || orderPage === 0;
    if ($('orders-next')) $('orders-next').disabled = !user || orderBusy || orderPage + 1 >= pages;
    $('refresh-plans').disabled = busy.has('plans');
    show('retry-order', !!pendingOrder);
    $('retry-order').disabled = !user || orderBusy;
    for (const button of $('plans').querySelectorAll('button')) button.disabled = !verified() || !!pendingOrder || orderBusy;
    for (const button of $('orders').querySelectorAll('button')) button.disabled = !user || orderBusy;
    }
  }
  // 所有异步操作绑定当前账户世代；旧请求、图片解码和绘图都不能写回新账户。
  function resetAccount() {
    clearTimeout(orderExpiryTimer);
    clearTimeout(orderQueryTimer);
    orderQueryAttempts.clear();
    waitingPoems.setActive(false);
    scope.reset(); pollScope.reset(); busy.clear(); imageVersion++;
    ready = true; polling = false;
    user = null; image = null; task = null; pendingOrder = null; orders = [];
    orderPage = 0;
    history.reset();
    if ($('orders-panel')) $('orders-panel').open = false;
    text('logout', '退出登录');
    show('retry-logout', false);
    revokePhoto(); clearResult();
    if (isCreate) { $('image').value = ''; $('task-details').open = false; }
    if (isAuth) {
    $('auth-form').reset(); $('verify-form').reset();
    $('verify-panel').open = false; show('invitation-field', false);
    $('password').autocomplete = 'current-password'; $('password').minLength = 1;
    }
    for (const id of ['balance', 'generation-id', 'image-status', 'order-request-id', 'auth-status', 'verify-status']) text(id, '');
    text('orders', '登录后查看订单。');
    announce('请先登录并验证邮箱。', 'generation-status');
    announce('', 'purchase-status');
    announce('', 'orders-status');
    sync();
  }
  async function request(ticket, path, body) {
    scope.assert(ticket);
    const value = await api(path, { body, signal: ticket.signal });
    scope.assert(ticket);
    return value;
  }
  async function action(key, statusID, callback) {
    if (busy.has(key)) return;
    const ticket = scope.capture();
    busy.add(key); sync();
    try { await callback(ticket); return true; }
    catch (error) {
      if (!scope.current(ticket) || error.name === 'AbortError') return;
      if (error.status === 401 && !(key === 'auth' && !user)) {
        resetAccount(); announce(errorMessage(error)); showLogin();
      } else {
        if (key === 'session') show('retry-session', true);
        announce(errorMessage(error), statusID);
        if (key === 'auth' || key === 'verify') ticket.focusId = statusID;
      }
    } finally {
      if (scope.current(ticket)) {
        busy.delete(key); sync();
        // 先解除 fieldset 的禁用状态，再把焦点移到下一步或局部错误提示。
        if (ticket.focusId) $(ticket.focusId).focus();
      }
    }
  }
  function setTask(id, attempt = null) {
    if (!UUID.test(id)) throw new Error('服务返回的任务编号无效。');
    pollScope.reset(); clearResult();
    task = { id, attempt, terminal: false, status: 'unknown' };
    text('generation-id', `任务编号：${id}`);
    sync();
  }
  async function refreshBalance(ticket, recover = true) {
    const balance = await request(ticket, '/balance');
    const free = balance?.free?.remaining, paid = balance?.paid?.remaining;
    if (![free, paid].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('余额响应无效，请刷新重试。');
    text('balance', `免费剩余 ${free} 次 · 付费剩余 ${paid} 次`);
    if (pageName === 'account') {
      $('balance').replaceChildren();
      for (const [label, value] of [['免费剩余', free], ['付费剩余', paid]]) {
        const item = doc.createElement('div');
        const name = doc.createElement('dt'); name.textContent = `${label} `;
        const count = doc.createElement('dd');
        const number = doc.createElement('strong'); number.textContent = value;
        const unit = doc.createElement('span'); unit.textContent = ' 次';
        count.append(number, unit); item.append(name, count); $('balance').append(item);
      }
    }
    if (isCreate && recover && balance.activeGenerationId && (!task || task.id !== balance.activeGenerationId) && !busy.has('task')) {
      setTask(balance.activeGenerationId);
      announce('正在恢复任务…', 'generation-status');
      void queryTask();
    }
    return balance;
  }
  function renderPlans() {
    $('plans').replaceChildren();
    for (const plan of plans) {
      const article = doc.createElement('article'); article.className = 'plan-item';
      const heading = doc.createElement('h3'); heading.textContent = plan.title;
      const credits = doc.createElement('p'); credits.textContent = `${plan.credits} 次创作`;
      if (pageName === 'account') {
        heading.textContent = `${plan.credits} 次创作`;
        credits.textContent = plan.title;
        credits.className = 'plan-caption';
        credits.hidden = plan.title.replace(/\s/g, '') === `${plan.credits}次` || plan.title.replace(/\s/g, '') === `${plan.credits}次创作`;
      }
      const price = doc.createElement('p'); price.className = 'plan-price'; price.textContent = money(plan.priceMinor, plan.currency);
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'button primary';
      button.textContent = `确认下单 · ${price.textContent}`; button.dataset.planId = plan.id;
      if (pageName === 'account') {
        button.textContent = '购买';
        button.setAttribute('aria-label', `购买 ${plan.credits} 次创作，${price.textContent}`);
      }
      button.addEventListener('click', () => {
        if (!verified() || pendingOrder || busy.has('orders')) return;
        void action('orders', 'purchase-status', async ticket => {
          pendingOrder = orderAttempt(plan.id, $('pay-method')?.value || (matchMedia('(max-width: 700px)').matches ? 'alipay_wap' : 'alipay_qrcode'));
          text('order-request-id', `下单请求编号：${pendingOrder.requestId}`); sync();
          await submitOrder(ticket);
        });
      });
      article.append(heading, credits, price, button); $('plans').append(article);
    }
    sync();
  }
  function money(amount, currency) {
    if (!Number.isSafeInteger(amount) || amount < 0 || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) throw new Error('套餐或订单价格格式无效，请刷新重试。');
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(amount / 100);
  }
  function validOrder(order) {
    if (!order || !UUID.test(order.id)) throw new Error('服务返回的订单编号无效，请从订单列表恢复。');
    return order;
  }
  function saveOrder(order, bringToFront = false) {
    validOrder(order);
    const index = orders.findIndex(item => item.id === order.id);
    if (bringToFront) orders = [order, ...orders.filter(item => item.id !== order.id)];
    else if (index >= 0) orders[index] = order;
    else orders.unshift(order);
    renderOrders();
  }
  function renderOrders() {
    clearTimeout(orderExpiryTimer);
    const now = Date.now();
    orders = orders.filter(order => order.status !== 'pending' || !Number.isFinite(Date.parse(order.createdAt)) || Date.parse(order.createdAt) + 600_000 > now);
    scheduleOrderQuery();
    const deadlines = orders.filter(order => order.status === 'pending').map(order => Date.parse(order.createdAt) + 600_000).filter(Number.isFinite);
    if (deadlines.length) orderExpiryTimer = setTimeout(renderOrders, Math.max(1, Math.min(...deadlines) - now));
    orderPage = Math.min(orderPage, Math.max(0, Math.ceil(orders.length / orderPageSize) - 1));
    $('orders').replaceChildren();
    if (!orders.length) { text('orders', '暂无订单'); sync(); return; }
    const visible = $('orders-pagination') ? orders.slice(orderPage * orderPageSize, (orderPage + 1) * orderPageSize) : orders;
    for (const order of visible) {
      const article = doc.createElement('article'); article.className = 'order-item'; article.dataset.orderId = order.id;
      const heading = doc.createElement(pageName === 'account' ? 'h3' : 'h4'); heading.textContent = `${order.credits ?? '—'} 次创作 · ${orderStatus(order)}`;
      const id = doc.createElement('p'); id.className = 'request-id'; id.textContent = `订单：${order.id}`;
      if (pageName === 'account') {
        const info = doc.createElement('div'); info.className = 'order-info';
        heading.textContent = `${order.credits ?? '—'} 次创作`;
        const status = doc.createElement('span'); status.className = 'order-status';
        status.setAttribute('role', 'status');
        const label = orderStatus(order);
        status.textContent = label.startsWith('已到账') ? label : ({ paid: '已支付 · 待到账', pending: '待支付确认', closed: '已关闭' })[order.status] || '待确认';
        status.dataset.state = label.startsWith('已到账') ? 'delivered' : 'pending';
        const created = doc.createElement('time'); created.className = 'order-created';
        const date = new Date(order.createdAt);
        created.textContent = Number.isFinite(date.getTime()) ? `创建于 ${date.toLocaleString('zh-CN', { hour12: false })}` : '创建时间未知';
        if (Number.isFinite(date.getTime())) created.dateTime = date.toISOString();
        info.append(heading, status, id, created); article.append(info);
      } else article.append(heading, id);
      if (order.amountMinor !== undefined && order.currency) {
        const price = doc.createElement('p'); price.className = 'order-price'; price.textContent = money(order.amountMinor, order.currency); article.append(price);
      }
      const actions = doc.createElement('div'); actions.className = 'actions';
      if (order.status === 'pending') {
        if (order.payment?.qrCode || order.payment?.paymentUrl) {
          try {
            const paymentArea = doc.createElement('div'); paymentArea.className = 'order-payment';
            if (order.payment.qrCode) {
              safePaymentURL(order.payment.qrCode, location.href);
              const channelURL = order.payment.qrCode;
              const qr = doc.createElement('figure'); qr.className = 'order-payment-qr';
              const caption = doc.createElement('figcaption'); caption.textContent = '支付宝扫码支付';
              qr.append(paymentQR(doc, channelURL), caption);
              paymentArea.append(qr);
            } else {
              const href = safePaymentURL(order.payment.paymentUrl, location.href);
              const link = doc.createElement('a'); link.href = href; link.className = 'button primary payment-link'; link.textContent = '前往支付宝支付';
              paymentArea.append(link);
            }
            article.append(paymentArea);
          } catch (error) {
            const warning = doc.createElement('p'); warning.textContent = errorMessage(error); article.append(warning);
          }
        }
        const payment = doc.createElement('button'); payment.type = 'button'; payment.className = 'button secondary'; payment.textContent = '刷新支付'; payment.dataset.action = 'payment';
        payment.addEventListener('click', () => void orderAction(order.id, 'payment'));
        actions.append(payment);
      }
      if (actions.childElementCount) article.append(actions);
      if (pageName === 'account') {
        const feedback = doc.createElement('p'); feedback.id = orderFeedbackId(order.id);
        feedback.className = 'create-status order-feedback'; feedback.hidden = true;
        feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
        article.append(feedback);
      }
      $('orders').append(article);
    }
    sync();
  }
  async function loadOrders(ticket) {
    announce('', $('orders-status') ? 'orders-status' : 'purchase-status');
    const response = await request(ticket, '/orders');
    const data = response === null ? [] : response;
    if (!Array.isArray(data)) throw new Error('订单列表响应无效，请重试。');
    orders = data.map(validOrder); renderOrders();
  }
  // 付款结果始终由服务端核验；逐单串行查询，避免慢请求重叠与无限重试。
  function needsOrderQuery(order) {
    return (order.status === 'pending' || (order.status === 'paid' && !order.delivery?.creditsGranted))
      && Date.parse(order.createdAt) + 600_000 > Date.now()
      && (orderQueryAttempts.get(order.id) || 0) < 120;
  }
  function scheduleOrderQuery() {
    clearTimeout(orderQueryTimer);
    if (!user || doc.hidden || !orders.some(needsOrderQuery)) return;
    orderQueryTimer = setTimeout(() => void queryPendingOrders(), 3000);
  }
  async function queryPendingOrders() {
    if (!user || doc.hidden) return;
    if (busy.has('orders')) { scheduleOrderQuery(); return; }
    const ticket = scope.capture();
    busy.add('orders');
    try {
      let changed = false;
      for (const previous of orders.filter(needsOrderQuery)) {
        if (doc.hidden) break;
        orderQueryAttempts.set(previous.id, (orderQueryAttempts.get(previous.id) || 0) + 1);
        try {
          const order = validOrder(await request(ticket, `/orders/${previous.id}/details`, {}));
          const index = orders.findIndex(item => item.id === order.id);
          if (index >= 0) orders[index] = order;
          changed ||= orderStatus(previous) !== orderStatus(order);
        } catch (error) {
          if (!scope.current(ticket) || error.name === 'AbortError') return;
          if (error.status === 401) { resetAccount(); showLogin(); return; }
          // 暂时失败保留原状态，下一轮在次数与有效期限制内重试。
        }
      }
      if (changed) { renderOrders(); await refreshBalance(ticket); }
    } catch (error) {
      if (scope.current(ticket) && error.status === 401) { resetAccount(); showLogin(); }
    } finally {
      if (scope.current(ticket)) { busy.delete('orders'); sync(); scheduleOrderQuery(); }
    }
  }
  doc.addEventListener('visibilitychange', scheduleOrderQuery);
  async function submitOrder(ticket) {
    announce('正在下单…', 'purchase-status');
    const order = await request(ticket, '/orders', pendingOrder);
    validOrder(order); pendingOrder = null; orderPage = 0; saveOrder(order, true);
    if ($('orders-panel')) $('orders-panel').open = true;
    announce(pageName === 'account' ? '' : `${orderStatus(order)}。`, 'purchase-status');
    const target = $('orders').querySelector(`[data-order-id="${order.id}"]`);
    if (target) {
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }
  function orderFeedbackId(id) {
    return pageName === 'account' ? `order-feedback-${id}` : 'purchase-status';
  }
  async function orderAction(id, suffix) {
    await action('orders', orderFeedbackId(id), async ticket => {
      announce(suffix === 'payment' ? '正在获取支付链接…' : '正在查询…', orderFeedbackId(id));
      const order = await request(ticket, `/orders/${id}/${suffix}`, {});
      saveOrder(order);
      announce(suffix === 'payment' ? '支付链接已更新。' : `${orderStatus(order)}。`, orderFeedbackId(id));
      await refreshBalance(ticket);
    });
  }
  async function drawCard(ticket) {
    if (!poem || busy.has('card')) return;
    const source = poem, sourceTask = task;
    busy.add('card'); sync(); clearCard();
    announce('正在生成分享图…', 'card-status');
    try {
      const blob = await renderPoemCard(source);
      scope.assert(ticket);
      if (poem !== source || task !== sourceTask) throw staleError();
      cardBlob = blob; cardURL = URL.createObjectURL(blob);
      $('poem-card').src = cardURL; $('download-card').href = cardURL;
      show('card-preview', true); show('download-card', true);
      const file = new File([blob], 'picpoet-poem.png', { type: 'image/png' });
      show('share-card', typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] }));
      announce('', 'card-status');
    } catch (error) {
      if (scope.current(ticket) && poem === source && task === sourceTask && error.name !== 'AbortError') announce(errorMessage(error), 'card-status');
    } finally { if (scope.current(ticket)) { busy.delete('card'); sync(); } }
  }
  async function receiveResult(ticket, status) {
    const result = await request(ticket, `/generations/${task.id}/result`);
    const expiry = status.resultAvailableUntil ? new Date(status.resultAvailableUntil) : null;
    text('result-expiry', expiry && Number.isFinite(expiry.getTime()) ? `服务端结果可取至 ${expiry.toLocaleString('zh-CN')}，请及时下载。` : '结果限时可取，不保证永久保存，请及时下载。');
    try {
      poem = poemData(result);
      // 文字与绘图使用同一解析结果；先展示正文，绘图超限仍可阅读、复制。
      text('poem-title', poem.title); text('poem-body', poem.body);
      text('poem-cipai', poem.cipai ? `词牌 · ${poem.cipai}` : '');
      show('result-content', true); show('result-empty', false);
      await drawCard(ticket);
    }
    catch (error) { announce(errorMessage(error), 'card-status'); }
  }
  async function monitor(ticket) {
    pollScope.reset();
    const pollTicket = pollScope.capture();
    const target = task;
    polling = true; sync();
    let status;
    try { status = await pollGeneration({
      signal: pollTicket.signal,
      read: async () => {
        const value = await api(`/generations/${target.id}`, { signal: pollTicket.signal });
        scope.assert(ticket); pollScope.assert(pollTicket); return value;
      },
      onStatus: value => {
        target.status = value.status;
        waitingPoems.setActive(value.status === 'queued' || value.status === 'running');
        announce(({ queued: '任务已受理，正在排队…', running: '正在为照片写诗，请稍候…', succeeded: '创作完成，正在读取作品…', failed: '任务执行失败。可重新查询原任务；新创作需明确点击，可能产生新的次数消耗。', expired: '任务结果已过期，无法恢复。请及时下载新作品。' })[value.status], 'generation-status');
      },
    }); } finally { if (scope.current(ticket)) { waitingPoems.setActive(false); polling = false; sync(); } }
    scope.assert(ticket); pollScope.assert(pollTicket);
    if (status.status === 'paused') {
      announce('查询已暂停，可继续查询。', 'generation-status');
    } else {
      target.terminal = true;
      if (status.status === 'succeeded') {
        await receiveResult(ticket, status);
        scope.assert(ticket);
        announce('', 'generation-status');
        void history.refresh();
      }
      await refreshBalance(ticket, false);
    }
  }
  async function queryTask() {
    if (!task || !user) return;
    await action('task', 'generation-status', ticket => monitor(ticket));
  }
  async function submitTask() {
    await action('task', 'generation-status', async ticket => {
      if (!verified()) throw new Error('请先登录并验证邮箱。');
      if (!task) setTaskFromInput();
      if (!task.attempt) throw new Error('此任务由服务器恢复，没有本地照片；请继续查询原任务。');
      announce('正在上传照片…', 'generation-status');
      const accepted = await request(ticket, '/generations', generationForm(task.attempt));
      if (accepted?.id !== task.id) throw new Error('服务返回的任务编号不匹配，请刷新余额恢复任务。');
      await monitor(ticket);
    });
  }
  function setTaskFromInput() {
    const attempt = generationAttempt(image?.blob, 'zh');
    setTask(attempt.id, attempt);
  }
  if (isAuth) {
  $('auth-mode').addEventListener('change', () => {
    const register = $('auth-mode').value === 'register'; show('invitation-field', register);
    text('auth-submit', register ? '注册并发送验证码' : '登录');
    $('password').minLength = register ? 8 : 1;
    $('password').autocomplete = register ? 'new-password' : 'current-password';
    text('auth-status', ''); sync();
  });
  for (const mode of ['login', 'register']) $('mode-' + mode).addEventListener('click', () => {
    $('auth-mode').value = mode;
    $('auth-mode').dispatchEvent(new Event('change'));
    $('email').focus();
  });
  show('auth-mode-field', false); show('auth-switch', true);
  $('auth-form').addEventListener('submit', event => {
    event.preventDefault();
    if (busy.has('auth')) return;
    void action('auth', 'auth-status', async ticket => {
      const mode = $('auth-mode').value;
      const email = $('email').value.trim();
      const body = { email, password: $('password').value };
      if (mode === 'register' && $('invitation').value.trim()) body.invitationCode = $('invitation').value.trim();
      announce(mode === 'register' ? '正在创建账户并发送验证码…' : '正在登录…', 'auth-status');
      const data = await request(ticket, `/${mode}`, body);
      $('password').value = '';
      if (mode === 'register') {
        $('verify-email').value = email; $('verify-panel').open = true;
        announce(data.otpSent ? '注册成功，验证码已发送。验证邮箱后请登录。' : '注册已受理，尚未确认验证码发送。请尝试重发验证码。', 'verify-status');
        text('auth-status', '');
        ticket.focusId = 'otp';
      } else {
        if (!data?.user?.id || typeof data.user.email !== 'string') throw new Error('登录响应无效，请重试。');
        if (pageName !== 'legacy') { location.assign(returnTo); return; }
        resetAccount(); user = data.user; ready = true; sync();
        void history.refresh();
        if (!plans.length) void loadPlans();
        announce(verified() ? '' : '邮箱尚未验证，请验证后退出并重新登录。');
        announce(verified() ? '' : '请验证邮箱后重新登录。', 'generation-status');
        if (verified()) $('image').focus();
        if (isCreate || isAccount) void action('balance', 'page-status', next => refreshBalance(next));
        if (isAccount) void action('orders', 'purchase-status', next => loadOrders(next));
      }
    });
  });
  $('verify-form').addEventListener('submit', event => {
    event.preventDefault();
    void action('verify', 'verify-status', async ticket => {
      const body = { email: $('verify-email').value.trim(), otp: $('otp').value.trim() };
      announce('正在验证邮箱…', 'verify-status');
      await request(ticket, '/verify-email', body);
      $('otp').value = '';
      announce('邮箱验证成功，请登录；若已登录，请先退出再重新登录以更新验证状态。', 'verify-status');
      if (!user) {
        $('auth-mode').value = 'login'; $('auth-mode').dispatchEvent(new Event('change')); $('email').value = body.email;
        announce('邮箱验证成功，输入密码即可开始创作。', 'auth-status');
        ticket.focusId = 'password';
      }
    });
  });
  $('resend-otp').addEventListener('click', () => {
    if (!$('verify-email').reportValidity()) return;
    void action('verify', 'verify-status', async ticket => {
      announce('正在请求发送验证码…', 'verify-status');
      await request(ticket, '/resend-otp', { email: $('verify-email').value.trim(), purpose: 'verify_email' });
      announce('重发请求已受理；符合条件的邮箱会收到验证码，请稍候并检查垃圾邮件。', 'verify-status');
    });
  });
  }
  $('logout')?.addEventListener('click', () => {
    resetAccount();
    void action('auth', 'page-status', async ticket => {
      announce('正在退出…');
      try { await request(ticket, '/logout', {}); announce('已退出登录。'); }
      catch (error) {
        if (scope.current(ticket)) {
          announce(`本页已清除。退出会话尚未确认：${errorMessage(error)} 请点击“重试退出”。`);
          // sync 隐藏匿名账户的常规退出按钮，另显示明确的会话退出重试入口。
          show('retry-logout', true);
        }
      }
    });
  });
  $('retry-logout')?.addEventListener('click', () => { show('retry-logout', false); $('logout').click(); });
  $('refresh-balance')?.addEventListener('click', () => void action('balance', 'page-status', ticket => refreshBalance(ticket)));
  if (isCreate) {
  $('image').addEventListener('change', () => {
    if (task || !verified()) return;
    const file = $('image').files?.[0];
    image = null; revokePhoto();
    const version = ++imageVersion;
    if (!file) { sync(); return; }
    void action('image', 'image-status', async ticket => {
      announce('正在处理照片…', 'image-status');
      const prepared = await prepareImage(file);
      scope.assert(ticket);
      if (version !== imageVersion) throw staleError();
      image = prepared; photoURL = URL.createObjectURL(prepared.blob);
      $('photo').src = photoURL; show('photo-preview', true);
      text('photo-caption', `${prepared.width} × ${prepared.height} · JPEG · ${(prepared.blob.size / 1024).toFixed(0)} KiB`);
      announce('', 'image-status');
    });
  });
  $('create-form').addEventListener('submit', event => { event.preventDefault(); if (!task && image && verified()) void submitTask(); });
  $('retry-generation').addEventListener('click', () => void submitTask());
  $('resume-generation').addEventListener('click', () => void queryTask());
  $('stop-poll').addEventListener('click', () => {
    pollScope.reset();
    announce('查询已暂停，后台仍在创作。', 'generation-status');
  });
  $('new-generation').addEventListener('click', () => {
    if (!task?.terminal || busy.has('task') || busy.has('card')) return;
    pollScope.reset(); task = null; clearResult(); text('generation-id', ''); sync();
    announce('', 'generation-status');
  });
  $('redraw-card').addEventListener('click', () => void drawCard(scope.capture()));
  $('share-card').addEventListener('click', () => void action('share', 'card-status', async ticket => {
    if (!cardBlob) return;
    const file = new File([cardBlob], 'picpoet-poem.png', { type: 'image/png' });
    try { await navigator.share({ files: [file], title: '图赋 · 诗词分享' }); scope.assert(ticket); announce('已交由系统分享。', 'card-status'); }
    catch (error) { if (error.name === 'AbortError') { if (scope.current(ticket)) announce('已取消分享，仍可下载 PNG。', 'card-status'); } else throw error; }
  }));
  }
  function loadPlans() {
    return action('plans', 'purchase-status', async ticket => {
      announce('正在加载套餐…', 'purchase-status');
      const data = await request(ticket, '/plans');
      if (!Array.isArray(data) || !data.every(plan => UUID.test(plan.id) && typeof plan.title === 'string' && Number.isSafeInteger(plan.credits) && plan.credits > 0)) throw new Error('套餐列表响应无效，请刷新重试。');
      data.forEach(plan => money(plan.priceMinor, plan.currency));
      plans = data; renderPlans();
      if (!plans.length) announce('暂无可购买套餐。', 'purchase-status');
      else if (['正在加载套餐…', '暂无可购买套餐。'].includes($('purchase-status').textContent)) {
        // 套餐成功不覆盖并行订单请求的错误或支付结果。
        announce('', 'purchase-status');
      }
    });
  }
  if (isAccount) {
  for (const [id, delta] of [['orders-prev', -1], ['orders-next', 1]]) {
    $(id)?.addEventListener('click', () => {
      if (!user || busy.has('orders')) return;
      const next = orderPage + delta;
      if (next < 0 || next >= Math.ceil(orders.length / orderPageSize)) return;
      orderPage = next; renderOrders();
    });
  }
  $('refresh-plans').addEventListener('click', () => void loadPlans());
  $('refresh-orders').addEventListener('click', () => void action('orders', $('orders-status') ? 'orders-status' : 'purchase-status', ticket => loadOrders(ticket)));
  $('retry-order').addEventListener('click', () => { if (pendingOrder) void action('orders', 'purchase-status', ticket => submitOrder(ticket)); });
  if ($('pay-method')) $('pay-method').value = matchMedia('(max-width: 700px)').matches ? 'alipay_wap' : 'alipay_qrcode';
  }
  if ($('login-link')) $('login-link').href = loginDestination(pageName + '.html', location.hash);
  if ($('continue-link')) $('continue-link').href = returnTo;
  sync();
  function loadSession() { show('retry-session', false); return action('session', 'page-status', async ticket => {
    try {
      const data = await request(ticket, '/session');
      if (data.authenticated) {
        if (!data.user?.id || typeof data.user.email !== 'string') throw new Error('会话响应无效，请重新登录。');
        user = data.user;
        void history.refresh();
        announce(verified() ? '' : '邮箱尚未验证，请前往登录页验证后重新登录。');
        announce(verified() ? '' : '请验证邮箱后重新登录。', 'generation-status');
        if (pageName === 'account') {
          await Promise.all([
            action('balance', 'page-status', next => refreshBalance(next)),
            action('orders', 'orders-status', next => loadOrders(next)),
          ]);
        } else {
          if (isCreate || isAccount) void action('balance', 'page-status', next => refreshBalance(next));
          if (isAccount) void action('orders', 'purchase-status', next => loadOrders(next));
        }
      } else { announce(''); showLogin(); }
    } finally { if (scope.current(ticket)) { ready = true; sync(); } }
  });
  }
  $('retry-session')?.addEventListener('click', () => void loadSession());
  void loadSession();
  if (isAccount) void loadPlans();
  // 不写入 localStorage / sessionStorage；离开页面即清除内存引用与对象 URL。
  globalThis.addEventListener('pagehide', () => { resetAccount(); });
  globalThis.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  return { destroy: resetAccount };
}
if (typeof document !== 'undefined' && (document.body.dataset.userPage || document.getElementById('create-form'))) mountCreatePage();
