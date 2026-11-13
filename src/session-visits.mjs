// 页面打开或重新回到前台时续期；不使用定时心跳，后台任务轮询不延长登录态。
export function startSessionVisits(visit) {
  let lastVisit = -Infinity;
  let pending = false;
  const renew = () => {
    if (document.visibilityState !== 'visible' || pending || Date.now() - lastVisit < 60_000) return;
    lastVisit = Date.now();
    pending = true;
    void Promise.resolve()
      .then(visit)
      .catch(() => {}) // 用户页通过现有会话提示重试；公开页保持可浏览。
      .finally(() => { pending = false; });
  };
  const restore = (event) => {
    if (event.persisted) { lastVisit = -Infinity; renew(); }
  };
  document.addEventListener('visibilitychange', renew);
  window.addEventListener('focus', renew);
  window.addEventListener('pageshow', restore);
  renew();
  return () => {
    document.removeEventListener('visibilitychange', renew);
    window.removeEventListener('focus', renew);
    window.removeEventListener('pageshow', restore);
  };
}
