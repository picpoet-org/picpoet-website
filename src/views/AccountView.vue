<script setup>
import { useSession } from '../composables/useSession.mjs';
import { useOrders } from '../composables/useOrders.mjs';
import SessionGate from '../components/SessionGate.vue';
import OrderItem from '../components/OrderItem.vue';
const session = useSession();
const { t, href, user, verified, busy, balance, money } = session;
const {
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
  retryOrder,
  refreshPayment,
} = useOrders(session);
</script>
<template>
  <main id="main" class="shell" tabindex="-1">
    <section class="create-intro account-intro">
      <h1>{{ t('account.title') }}</h1>
      <a class="button primary" :href="href('create.html')">{{ t('account.create') }}</a>
    </section>
    <SessionGate :session="session" />
    <section class="create-panel account-panel" aria-labelledby="account-title">
      <div class="section-top">
        <h2 id="account-title">{{ t('account.mine') }}</h2>
        <button
          id="logout"
          class="button quiet-button"
          type="button"
          :hidden="!user"
          :disabled="busy.has('auth')"
          @click="session.logout"
        >
          {{ t('session.logout') }}
        </button>
      </div>
      <div id="account-summary" :hidden="!user">
        <div class="account-identity">
          <p id="account-name">{{ user?.email }}</p>
          <span id="account-verification" class="account-badge">{{
            t(verified ? 'session.verified' : 'session.pending')
          }}</span>
        </div>
        <dl id="balance" class="account-balance" :aria-label="t('account.remaining')">
          <div v-for="kind in ['free', 'paid']" :key="kind">
            <dt>{{ t('session.' + kind) }}</dt>
            <dd>
              <strong>{{ balance?.[kind]?.remaining ?? '—' }}</strong><span> {{ t('session.unit') }}</span>
            </dd>
          </div>
        </dl>
        <div class="account-links">
          <a class="text-link" href="#purchase">{{ t('account.topUp') }}</a><a
            class="text-link"
            :href="href('works.html')"
            >{{ t('nav.works') }}</a
          ><button
            id="refresh-balance"
            class="button quiet-button"
            type="button"
            :disabled="busy.has('balance')"
            @click="session.action('balance', session.status, (ticket) => session.refreshBalance(ticket))"
          >
            {{ t('account.refreshBalance') }}
          </button>
        </div>
      </div>
    </section>
    <section id="purchase" class="create-panel purchase-panel" aria-labelledby="plans-title">
      <div class="section-top">
        <h2 id="plans-title">{{ t('account.plans') }}</h2>
        <button
          id="refresh-plans"
          class="button quiet-button"
          type="button"
          :disabled="busy.has('plans')"
          @click="loadPlans"
        >
          {{ t('account.refreshPlans') }}
        </button>
      </div>
      <p class="payment-method">{{ t('account.alipay') }}</p>
      <p id="purchase-status" class="create-status" role="status" aria-live="polite">{{ status }}</p>
      <div id="plans" class="plan-grid">
        <article v-for="plan in plans" :key="plan.id" class="plan-item">
          <h3>{{ t('common.credits', { count: plan.credits }) }}</h3>
          <p
            v-if="
              plan.title.replace(/\s/g, '') !== `${plan.credits}次创作` &&
              plan.title.replace(/\s/g, '') !== `${plan.credits}次`
            "
            class="plan-caption"
          >
            {{ plan.title }}
          </p>
          <p class="plan-price">{{ money(plan.priceMinor, plan.currency) }}</p>
          <button
            class="button primary"
            type="button"
            :data-plan-id="plan.id"
            :aria-label="
              t('account.buyLabel', { count: plan.credits, price: money(plan.priceMinor, plan.currency) })
            "
            :disabled="!verified || !!pendingOrder || busy.has('orders')"
            @click="buy(plan)"
          >
            {{ t('account.buy') }}
          </button>
        </article>
      </div>
      <button
        id="retry-order"
        class="button secondary"
        type="button"
        :hidden="!pendingOrder"
        :disabled="!user || busy.has('orders')"
        @click="retryOrder"
      >
        {{ t('account.retryOrder') }}
      </button>
      <p id="order-request-id" class="request-id">
        {{ pendingOrder ? t('account.requestId', { id: pendingOrder.requestId }) : '' }}
      </p>
    </section>
    <details id="orders-panel" ref="panel" class="create-panel orders-panel">
      <summary>
        <h2 id="orders-title">{{ t('account.orders') }}</h2>
      </summary>
      <div class="section-top">
        <button
          id="refresh-orders"
          class="button quiet-button"
          type="button"
          :disabled="!user || busy.has('orders')"
          @click="loadOrders"
        >
          {{ t('account.refreshOrders') }}
        </button>
      </div>
      <p id="orders-status" class="create-status" role="status" aria-live="polite">{{ ordersStatus }}</p>
      <div id="orders" class="order-list">
        <p v-if="!orders.length">{{ t(user ? 'account.emptyOrders' : 'account.loginOrders') }}</p>
        <OrderItem
          v-for="order in visibleOrders"
          :key="order.id"
          :order="order"
          :label="orderLabel(order)"
          :busy="busy.has('orders')"
          :feedback="feedback[order.id]"
          @payment="refreshPayment"
        />
      </div>
      <nav
        id="orders-pagination"
        class="orders-pagination"
        :aria-label="t('account.pagination')"
        :hidden="totalPages <= 1"
      >
        <button
          id="orders-prev"
          class="button secondary"
          type="button"
          aria-controls="orders"
          :disabled="page === 0 || busy.has('orders')"
          @click="page--"
        >
          {{ t('account.previous') }}</button><span id="orders-page" role="status" aria-live="polite"
          >{{ page + 1 }} / {{ totalPages }}</span
        ><button
          id="orders-next"
          class="button secondary"
          type="button"
          aria-controls="orders"
          :disabled="page + 1 >= totalPages || busy.has('orders')"
          @click="page++"
        >
          {{ t('account.next') }}
        </button>
      </nav>
    </details>
  </main>
</template>
