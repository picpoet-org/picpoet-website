// 仅由应用启动与前台事件触发；成功后五分钟内复用，失败退避，不使用定时心跳。
export function startSessionVisits(visit) {
  let nextVisit = -Infinity;
  let failures = 0;
  let pending = false;
  const renew = () => {
    if (document.visibilityState !== 'visible' || pending || Date.now() < nextVisit) return;
    pending = true;
    void Promise.resolve()
      .then(visit)
      .catch(() => false)
      .then((success) => {
        failures = success === false ? failures + 1 : 0;
        nextVisit =
          Date.now() + (failures ? Math.min(300_000, 30_000 * 2 ** Math.min(failures - 1, 4)) : 300_000);
      })
      .finally(() => {
        pending = false;
      });
  };
  const restore = (event) => {
    if (event.persisted) {
      nextVisit = -Infinity;
      renew();
    }
  };
  document.addEventListener('visibilitychange', renew);
  window.addEventListener('focus', renew);
  window.addEventListener('online', renew);
  window.addEventListener('pageshow', restore);
  renew();
  return () => {
    document.removeEventListener('visibilitychange', renew);
    window.removeEventListener('focus', renew);
    window.removeEventListener('online', renew);
    window.removeEventListener('pageshow', restore);
  };
}
