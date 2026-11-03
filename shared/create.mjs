import { createAPI, createScope, errorMessage, prepareImage, generationAttempt, generationForm, orderAttempt, safePaymentURL, orderStatus, pollGeneration, UUID, staleError } from './create-core.mjs';
import { poemData, renderPoemCard } from './poem-card.mjs';
export * from './create-core.mjs';

export function mountCreatePage(doc = document) {
  const $ = id => doc.getElementById(id);
  const api = createAPI();
  const scope = createScope();
  const pollScope = createScope();
  const busy = new Set();
  let ready = false, user = null, image = null, photoURL = '', cardURL = '', cardBlob = null, polling = false;
  let task = null, poem = null, pendingOrder = null, plans = [], orders = [], imageVersion = 0;
  const text = (id, value) => { $(id).textContent = value; };
  const show = (id, yes) => { $(id).hidden = !yes; };
  const verified = () => user?.emailVerified === true;
  const announce = (message, id = 'page-status') => text(id, message);
  function revokePhoto() {
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = ''; $('photo').removeAttribute('src'); show('photo-preview', false);
  }
  function clearCard() {
    if (cardURL) URL.revokeObjectURL(cardURL);
    cardURL = ''; cardBlob = null;
    $('poem-card').removeAttribute('src'); $('download-card').removeAttribute('href');
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
    show('auth-panel', !user); show('account-summary', !!user); show('logout', !!user);
    $('auth-fields').disabled = !ready || authBusy;
    $('verify-fields').disabled = !ready || authBusy || busy.has('verify');
    $('logout').disabled = authBusy;
    text('account-name', user ? `${user.email} · ${verified() ? '邮箱已验证' : '邮箱待验证'}` : '');
    $('refresh-balance').disabled = !user || busy.has('balance');
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
    $('pay-method').disabled = !!pendingOrder || orderBusy;
    $('refresh-orders').disabled = !user || orderBusy;
    $('refresh-plans').disabled = busy.has('plans');
    show('retry-order', !!pendingOrder);
    $('retry-order').disabled = !user || orderBusy;
    for (const button of $('plans').querySelectorAll('button')) button.disabled = !verified() || !!pendingOrder || orderBusy;
    for (const button of $('orders').querySelectorAll('button')) button.disabled = !user || orderBusy;
  }
  // 所有异步操作绑定当前账户世代；旧请求、图片解码和绘图都不能写回新账户。
  function resetAccount() {
    scope.reset(); pollScope.reset(); busy.clear(); imageVersion++;
    ready = true; polling = false;
    user = null; image = null; task = null; pendingOrder = null; orders = [];
    text('logout', '退出登录');
    show('retry-logout', false);
    revokePhoto(); clearResult();
    $('image').value = ''; $('auth-form').reset(); $('verify-form').reset();
    $('verify-panel').open = false; show('invitation-field', false);
    text('auth-submit', '登录'); $('password').autocomplete = 'current-password'; $('password').minLength = 1;
    for (const id of ['balance', 'generation-id', 'image-status', 'order-request-id']) text(id, '');
    text('orders', '登录后查看订单。');
    announce('请先登录并验证邮箱。', 'generation-status');
    announce('登录并验证邮箱后可明确选择套餐下单。', 'purchase-status');
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
    try { await callback(ticket); }
    catch (error) {
      if (!scope.current(ticket) || error.name === 'AbortError') return;
      if (error.status === 401) {
        resetAccount(); announce(errorMessage(error)); $('email').focus();
      } else announce(errorMessage(error), statusID);
    } finally { if (scope.current(ticket)) { busy.delete(key); sync(); } }
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
    text('balance', `免费剩余 ${free} 次 · 付费剩余 ${paid} 次（占用中的次数以服务状态为准）`);
    if (recover && balance.activeGenerationId && (!task || task.id !== balance.activeGenerationId) && !busy.has('task')) {
      setTask(balance.activeGenerationId);
      announce('已从余额恢复进行中任务，仅查询原任务，不会重复提交。', 'generation-status');
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
      const price = doc.createElement('p'); price.className = 'plan-price'; price.textContent = money(plan.priceMinor, plan.currency);
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'button primary';
      button.textContent = `确认下单 · ${price.textContent}`; button.dataset.planId = plan.id;
      button.addEventListener('click', () => {
        if (!verified() || pendingOrder || busy.has('orders')) return;
        void action('orders', 'purchase-status', async ticket => {
          pendingOrder = orderAttempt(plan.id, $('pay-method').value);
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
  function saveOrder(order) {
    validOrder(order);
    orders = [order, ...orders.filter(item => item.id !== order.id)];
    renderOrders();
  }
  function renderOrders() {
    $('orders').replaceChildren();
    if (!orders.length) { text('orders', '暂无订单。选择套餐并确认下单后，订单会显示在这里。'); return; }
    for (const order of orders) {
      const article = doc.createElement('article'); article.className = 'order-item'; article.dataset.orderId = order.id;
      const heading = doc.createElement('h4'); heading.textContent = `${order.credits ?? '—'} 次创作 · ${orderStatus(order)}`;
      const id = doc.createElement('p'); id.className = 'request-id'; id.textContent = `订单：${order.id}`;
      article.append(heading, id);
      if (order.amountMinor !== undefined && order.currency) {
        const price = doc.createElement('p'); price.textContent = money(order.amountMinor, order.currency); article.append(price);
      }
      const actions = doc.createElement('div'); actions.className = 'actions';
      const query = doc.createElement('button'); query.type = 'button'; query.className = 'button secondary'; query.textContent = '查询到账'; query.dataset.action = 'details';
      query.addEventListener('click', () => void orderAction(order.id, 'details'));
      actions.append(query);
      if (order.status === 'pending') {
        if (order.payment?.paymentUrl) {
          try {
            const href = safePaymentURL(order.payment.paymentUrl, location.href);
            const link = doc.createElement('a'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'button primary payment-link'; link.textContent = '打开支付链接（新窗口）';
            link.addEventListener('click', () => announce('请在新窗口完成支付。若未打开，请检查浏览器拦截；未跳转不代表成功。返回后点击“查询到账”。', 'purchase-status'));
            actions.append(link);
          } catch (error) {
            const warning = doc.createElement('p'); warning.textContent = errorMessage(error); article.append(warning);
          }
        }
        const payment = doc.createElement('button'); payment.type = 'button'; payment.className = 'button secondary'; payment.textContent = '重新获取支付链接'; payment.dataset.action = 'payment';
        payment.addEventListener('click', () => void orderAction(order.id, 'payment'));
        actions.append(payment);
      }
      article.append(actions); $('orders').append(article);
    }
    sync();
  }
  async function loadOrders(ticket) {
    const response = await request(ticket, '/orders');
    const data = response === null ? [] : response;
    if (!Array.isArray(data)) throw new Error('订单列表响应无效，请重试。');
    orders = data.map(validOrder); renderOrders();
  }
  async function submitOrder(ticket) {
    announce('正在下单；若网络中断，请使用原编号重试。', 'purchase-status');
    const order = await request(ticket, '/orders', pendingOrder);
    validOrder(order); pendingOrder = null; saveOrder(order);
    announce(`订单已受理，${orderStatus(order)}。请明确点击支付链接，付款后手动查询到账。`, 'purchase-status');
  }
  async function orderAction(id, suffix) {
    await action('orders', 'purchase-status', async ticket => {
      const order = await request(ticket, `/orders/${id}/${suffix}`, {});
      saveOrder(order);
      announce(`${orderStatus(order)}。${suffix === 'payment' ? '请点击支付链接在新窗口继续。' : '以查询状态和余额为准，待确认时请稍后再次查询。'}`, 'purchase-status');
      await refreshBalance(ticket);
    });
  }
  async function drawCard(ticket) {
    if (!poem || busy.has('card')) return;
    const source = poem, sourceTask = task;
    busy.add('card'); sync(); clearCard();
    announce('正在加载文楷字体并本地绘制 PNG…', 'card-status');
    try {
      const blob = await renderPoemCard(source);
      scope.assert(ticket);
      if (poem !== source || task !== sourceTask) throw staleError();
      cardBlob = blob; cardURL = URL.createObjectURL(blob);
      $('poem-card').src = cardURL; $('download-card').href = cardURL;
      show('card-preview', true); show('download-card', true);
      const file = new File([blob], 'picpoet-poem.png', { type: 'image/png' });
      show('share-card', typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] }));
      announce('分享图已在本地生成。建议现在下载保存。', 'card-status');
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
        announce(({ queued: '任务已受理，正在排队…', running: '正在为照片写诗，请稍候…', succeeded: '创作完成，正在读取作品…', failed: '任务执行失败。可重新查询原任务；新创作需明确点击，可能产生新的次数消耗。', expired: '任务结果已过期，无法恢复。请及时下载新作品。' })[value.status], 'generation-status');
      },
    }); } finally { if (scope.current(ticket)) { polling = false; sync(); } }
    scope.assert(ticket); pollScope.assert(pollTicket);
    if (status.status === 'paused') {
      announce('已达到本轮 40 次查询上限，自动查询已暂停。点击“继续查询原任务”不会重新扣费或新建任务。', 'generation-status');
    } else {
      target.terminal = true;
      if (status.status === 'succeeded') {
        await receiveResult(ticket, status);
        scope.assert(ticket);
        announce('创作已完成，请及时保存作品。', 'generation-status');
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
      announce('正在上传已去除元数据的照片。网络失败请保留原任务编号重试。', 'generation-status');
      const accepted = await request(ticket, '/generations', generationForm(task.attempt));
      if (accepted?.id !== task.id) throw new Error('服务返回的任务编号不匹配，请刷新余额恢复任务。');
      await monitor(ticket);
    });
  }
  function setTaskFromInput() {
    const attempt = generationAttempt(image?.blob, $('poem-language').value);
    setTask(attempt.id, attempt);
  }
  $('auth-mode').addEventListener('change', () => {
    const register = $('auth-mode').value === 'register'; show('invitation-field', register);
    text('auth-submit', register ? '注册并发送验证码' : '登录');
    $('password').minLength = register ? 8 : 1;
    $('password').autocomplete = register ? 'new-password' : 'current-password';
  });
  $('auth-form').addEventListener('submit', event => {
    event.preventDefault();
    if (busy.has('auth')) return;
    void action('auth', 'page-status', async ticket => {
      const mode = $('auth-mode').value;
      const email = $('email').value.trim();
      const body = { email, password: $('password').value };
      if (mode === 'register' && $('invitation').value.trim()) body.invitationCode = $('invitation').value.trim();
      $('password').value = '';
      const data = await request(ticket, `/${mode}`, body);
      if (mode === 'register') {
        $('verify-email').value = email; $('verify-panel').open = true;
        announce(data.otpSent ? '注册成功，验证码已发送。验证邮箱后请登录。' : '注册已受理，尚未确认验证码发送。请尝试重发验证码。');
        $('otp').focus();
      } else {
        if (!data?.user?.id || typeof data.user.email !== 'string') throw new Error('登录响应无效，请重试。');
        resetAccount(); user = data.user; ready = true; sync();
        if (!plans.length) void loadPlans();
        announce(verified() ? '登录成功。请选择照片，或恢复进行中任务。' : '邮箱尚未验证，请验证后退出并重新登录。');
        announce(verified() ? '选择照片，仅点击生成才上传。' : '请验证邮箱后重新登录。', 'generation-status');
        void action('balance', 'page-status', next => refreshBalance(next));
        void action('orders', 'purchase-status', next => loadOrders(next));
      }
    });
  });
  $('verify-form').addEventListener('submit', event => {
    event.preventDefault();
    void action('verify', 'page-status', async ticket => {
      const body = { email: $('verify-email').value.trim(), otp: $('otp').value.trim() };
      $('otp').value = '';
      await request(ticket, '/verify-email', body);
      announce('邮箱验证成功，请登录；若已登录，请先退出再重新登录以更新验证状态。');
      if (!user) { $('auth-mode').value = 'login'; $('auth-mode').dispatchEvent(new Event('change')); $('email').value = body.email; $('password').focus(); }
    });
  });
  $('resend-otp').addEventListener('click', () => {
    if (!$('verify-email').reportValidity()) return;
    void action('verify', 'page-status', async ticket => {
      await request(ticket, '/resend-otp', { email: $('verify-email').value.trim(), purpose: 'verify_email' });
      announce('重发请求已受理；符合条件的邮箱会收到验证码，请稍候并检查垃圾邮件。');
    });
  });
  $('logout').addEventListener('click', () => {
    resetAccount();
    void action('auth', 'page-status', async ticket => {
      announce('本页私人内容已清除，正在退出会话…');
      try { await request(ticket, '/logout', {}); announce('已退出登录，本页照片、作品和账户信息已清除。'); }
      catch (error) {
        if (scope.current(ticket)) {
          announce(`本页已清除。退出会话尚未确认：${errorMessage(error)} 请点击“重试退出”。`);
          // sync 隐藏匿名账户的常规退出按钮，另显示明确的会话退出重试入口。
          show('retry-logout', true);
        }
      }
    });
  });
  $('retry-logout').addEventListener('click', () => { show('retry-logout', false); $('logout').click(); });
  $('refresh-balance').addEventListener('click', () => void action('balance', 'page-status', ticket => refreshBalance(ticket)));
  $('image').addEventListener('change', () => {
    if (task || !verified()) return;
    const file = $('image').files?.[0];
    image = null; revokePhoto();
    const version = ++imageVersion;
    if (!file) { sync(); return; }
    void action('image', 'image-status', async ticket => {
      announce('正在本地解码、缩放并去除原文件元数据…', 'image-status');
      const prepared = await prepareImage(file);
      scope.assert(ticket);
      if (version !== imageVersion) throw staleError();
      image = prepared; photoURL = URL.createObjectURL(prepared.blob);
      $('photo').src = photoURL; show('photo-preview', true);
      text('photo-caption', `${prepared.width} × ${prepared.height} · JPEG · ${(prepared.blob.size / 1024).toFixed(0)} KiB`);
      announce('图片已在本地处理，尚未上传。', 'image-status');
    });
  });
  $('create-form').addEventListener('submit', event => { event.preventDefault(); if (!task && image && verified()) void submitTask(); });
  $('retry-generation').addEventListener('click', () => void submitTask());
  $('resume-generation').addEventListener('click', () => void queryTask());
  $('stop-poll').addEventListener('click', () => {
    pollScope.reset();
    announce('已暂停自动查询（上传或结果读取若正在进行仍会完成）。服务端任务不会取消，可继续查询原任务。', 'generation-status');
  });
  $('new-generation').addEventListener('click', () => {
    if (!task?.terminal || busy.has('task') || busy.has('card')) return;
    pollScope.reset(); task = null; clearResult(); text('generation-id', ''); sync();
    announce('已准备新的创作。点击生成才会创建新任务并使用次数。', 'generation-status');
  });
  $('redraw-card').addEventListener('click', () => void drawCard(scope.capture()));
  $('share-card').addEventListener('click', () => void action('share', 'card-status', async ticket => {
    if (!cardBlob) return;
    const file = new File([cardBlob], 'picpoet-poem.png', { type: 'image/png' });
    try { await navigator.share({ files: [file], title: '图赋 · 诗词分享' }); scope.assert(ticket); announce('已交由系统分享。', 'card-status'); }
    catch (error) { if (error.name === 'AbortError') { if (scope.current(ticket)) announce('已取消分享，仍可下载 PNG。', 'card-status'); } else throw error; }
  }));
  function loadPlans() {
    return action('plans', 'purchase-status', async ticket => {
      const data = await request(ticket, '/plans');
      if (!Array.isArray(data) || !data.every(plan => UUID.test(plan.id) && typeof plan.title === 'string' && Number.isSafeInteger(plan.credits) && plan.credits > 0)) throw new Error('套餐列表响应无效，请刷新重试。');
      data.forEach(plan => money(plan.priceMinor, plan.currency));
      plans = data; renderPlans(); announce(plans.length ? '套餐已更新。请选择支付方式，再明确确认下单。' : '暂时没有可购买套餐。', 'purchase-status');
    });
  }
  $('refresh-plans').addEventListener('click', () => void loadPlans());
  $('refresh-orders').addEventListener('click', () => void action('orders', 'purchase-status', ticket => loadOrders(ticket)));
  $('retry-order').addEventListener('click', () => { if (pendingOrder) void action('orders', 'purchase-status', ticket => submitOrder(ticket)); });
  $('pay-method').value = matchMedia('(max-width: 700px)').matches ? 'alipay_wap' : 'alipay_page';
  sync();
  void action('session', 'page-status', async ticket => {
    try {
      const data = await request(ticket, '/session');
      if (data.authenticated) {
        if (!data.user?.id || typeof data.user.email !== 'string') throw new Error('会话响应无效，请重新登录。');
        user = data.user;
        announce(verified() ? '会话已恢复，正在加载余额与订单。' : '邮箱尚未验证，请验证后重新登录。');
        announce(verified() ? '选择照片，仅点击生成才上传。' : '请验证邮箱后重新登录。', 'generation-status');
        void action('balance', 'page-status', next => refreshBalance(next));
        void action('orders', 'purchase-status', next => loadOrders(next));
      } else announce('登录或注册，开始创作。');
    } finally { if (scope.current(ticket)) { ready = true; sync(); } }
  });
  void loadPlans();
  // 不写入 localStorage / sessionStorage；离开页面即清除内存引用与对象 URL。
  globalThis.addEventListener('pagehide', () => { resetAccount(); });
  globalThis.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  return { destroy: resetAccount };
}
if (typeof document !== 'undefined' && document.getElementById('create-form')) mountCreatePage();
