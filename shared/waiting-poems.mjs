// 等待时展示公版古典诗句，与用户照片及模型输出无关。
const poems = [
  ['行到水穷处，坐看云起时。', '王维《终南别业》'],
  ['明月松间照，清泉石上流。', '王维《山居秋暝》'],
  ['山光悦鸟性，潭影空人心。', '常建《题破山寺后禅院》'],
  ['采菊东篱下，悠然见南山。', '陶渊明《饮酒·其五》'],
  ['疏影横斜水清浅，暗香浮动月黄昏。', '林逋《山园小梅·其一》'],
  ['一道残阳铺水中，半江瑟瑟半江红。', '白居易《暮江吟》'],
];

export function mountWaitingPoems(anchor) {
  if (!anchor) return { setActive() {} };
  const doc = anchor.ownerDocument;
  const panel = doc.createElement('aside');
  panel.className = 'waiting-poems'; panel.id = 'waiting-poems'; panel.hidden = true;
  panel.setAttribute('aria-label', '等候时读一首诗');
  // 不放进 live region，避免每次切换打断读屏中的任务状态。
  const quote = doc.createElement('blockquote');
  const line = doc.createElement('p');
  const source = doc.createElement('cite');
  const toggle = doc.createElement('button');
  toggle.type = 'button'; toggle.className = 'waiting-poems-toggle';
  toggle.textContent = '暂停轮播';
  quote.append(line, source); panel.append(quote, toggle); anchor.after(panel);
  let active = false, paused = false, index = 0, timer = null, animation = null;
  function stop() {
    clearInterval(timer); timer = null;
    animation?.cancel(); animation = null;
  }
  function render() {
    line.textContent = poems[index][0]; source.textContent = poems[index][1];
    animation?.cancel();
    if (!doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation = quote.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 650, easing: 'ease-out' });
    }
  }
  function start() {
    stop();
    if (active && !paused) timer = setInterval(() => { index = (index + 1) % poems.length; render(); }, 6000);
  }
  toggle.addEventListener('click', () => {
    paused = !paused; toggle.textContent = paused ? '继续轮播' : '暂停轮播'; start();
  });
  return {
    setActive(value) {
      if (active === value) return;
      active = value; panel.hidden = !active;
      if (active) { render(); start(); } else stop();
    },
  };
}
