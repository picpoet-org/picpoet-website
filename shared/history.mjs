import { ApiError, UUID, errorMessage, staleError } from './create-core.mjs';
import { poemData, renderPoemCard } from './poem-card.mjs';

const MAX_IMAGE = 2 * 1024 * 1024;
const message = error => error.status === 503 ? '历史尚未启用，仍可正常创作并下载当前作品。' : [404, 410].includes(error.status) ? '这份历史已删除或过期，无法恢复。' : errorMessage(error);
const time = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : '时间未知';
};

// 与创作区只共享账户生命周期，不共享照片、任务、作品或导出状态。
export function mountHistory({ doc, api, scope, loggedIn, onUnauthorized }) {
  const $ = id => doc.getElementById(id);
  const status = (value, id = 'history-status') => { $(id).textContent = value; $(id).hidden = !value; };
  const rows = new Map();
  let cursor = null, listVersion = 0, detailVersion = 0, listBusy = false;
  let selected = null, detailURL = '', cardURL = '', deleteBusy = false, retryMore = false;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      observer.unobserve(entry.target);
      const row = rows.get(entry.target.dataset.historyId);
      if (row) void thumbnail(row);
    }
  }, { rootMargin: '160px' });
  function controls() {
    $('refresh-history').disabled = !loggedIn() || listBusy || deleteBusy;
    $('history-more').hidden = !cursor;
    $('history-more').disabled = listBusy || deleteBusy;
    $('history-list').setAttribute('aria-busy', String(listBusy));
  }
  function clearDetail() {
    const trigger = rows.get(selected)?.button;
    if ($('history-detail').open) $('history-detail').close();
    for (const row of rows.values()) row.button.setAttribute('aria-expanded', 'false');
    detailVersion++; selected = null;
    if ($('history-delete-dialog').open) $('history-delete-dialog').close();
    for (const url of [detailURL, cardURL]) if (url) URL.revokeObjectURL(url);
    detailURL = ''; cardURL = '';
    $('history-photo').removeAttribute('src'); $('history-card').removeAttribute('src');
    $('history-download').removeAttribute('href'); $('history-download').hidden = true;
    $('history-card').hidden = true; $('history-detail').hidden = true;
    $('history-render').disabled = false; $('history-delete').disabled = false;
    $('history-render').onclick = null;
    $('history-delete-confirm').disabled = false;
    for (const id of ['history-detail-title', 'history-body', 'history-cipai', 'history-time', 'history-detail-status', 'history-export-status']) status('', id);
    if (trigger?.isConnected) trigger.focus();
  }
  function clearRows() {
    observer.disconnect();
    for (const row of rows.values()) if (row.url) URL.revokeObjectURL(row.url);
    rows.clear(); $('history-list').replaceChildren();
  }
  function reset() {
    listVersion++; listBusy = false; deleteBusy = false; cursor = null; retryMore = false;
    clearRows(); clearDetail();
    $('history-retry').hidden = true;
    status(''); controls();
  }
  function report(error, ticket, target = 'history-status') {
    if (!scope.current(ticket) || error.name === 'AbortError') return;
    if (error.status === 401) { onUnauthorized(); return; }
    status(message(error), target);
  }
  async function image(id, ticket) {
    scope.assert(ticket);
    const controller = new AbortController();
    const abort = () => controller.abort();
    ticket.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 20_000);
    try {
      const response = await fetch(`/web-api/history/${id}/image`, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new ApiError(response.status);
      if (!/^image\/jpeg(?:\s*;|$)/i.test(response.headers.get('content-type') || '') || Number(response.headers.get('content-length')) > MAX_IMAGE) throw new Error('历史图片格式或大小无效。');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > MAX_IMAGE) { controller.abort(); throw new Error('历史图片超过 2 MiB。'); }
        chunks.push(chunk);
      }
      scope.assert(ticket);
      return new Blob(chunks, { type: 'image/jpeg' });
    } catch (error) {
      if (!scope.current(ticket)) throw staleError();
      if (controller.signal.aborted && error.name === 'AbortError') throw new ApiError(504);
      throw error;
    } finally { clearTimeout(timer); ticket.signal.removeEventListener('abort', abort); }
  }
  async function thumbnail(row) {
    const ticket = scope.capture();
    try {
      const blob = await image(row.id, ticket);
      scope.assert(ticket);
      if (rows.get(row.id) !== row) return;
      row.url = URL.createObjectURL(blob); row.img.src = row.url;
    } catch (error) {
      if (scope.current(ticket) && rows.get(row.id) === row) {
        row.img.alt = '缩略图暂不可用，可打开详情重试';
        report(error, ticket);
      }
    }
  }
  function append(item) {
    if (rows.has(item.id)) return;
    const article = doc.createElement('article'); article.className = 'history-item'; article.dataset.historyId = item.id;
    const img = doc.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.width = 240; img.height = 400;
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'history-image-toggle';
    button.setAttribute('aria-label', `${item.title || '作品'}：查看完整诗词`);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'history-detail');
    button.append(img);
    button.addEventListener('click', () => {
      if (deleteBusy) return;
      if (selected === item.id) clearDetail(); else void open(item.id);
    });
    const title = doc.createElement('h3'); title.className = 'history-item-title'; title.textContent = item.title || '无题';
    const excerpt = doc.createElement('p'); excerpt.className = 'history-excerpt'; excerpt.textContent = item.excerpt;
    const date = doc.createElement('p'); date.className = 'fine-print'; date.textContent = time(item.createdAt);
    const copy = doc.createElement('div'); copy.className = 'history-item-copy';
    copy.append(title, excerpt, date);
    article.append(button, copy);
    const row = { id: item.id, article, img, button, url: '' }; rows.set(item.id, row);
    $('history-list').append(article); observer.observe(article);
  }
  async function load(more = false) {
    if (!loggedIn() || deleteBusy || (more && (listBusy || !cursor))) return;
    const ticket = scope.capture(), version = ++listVersion;
    const after = more ? cursor : null;
    listBusy = true; retryMore = more; controls(); $('history-retry').hidden = true;
    status('加载中…');
    try {
      const data = await api(`/history?limit=20${after ? `&cursor=${encodeURIComponent(after)}` : ''}`, { signal: ticket.signal });
      scope.assert(ticket); if (version !== listVersion) return;
      if (!Array.isArray(data?.items) || !data.items.every(item => item && UUID.test(item.id) && typeof item.excerpt === 'string' && typeof item.title === 'string') || !(data.nextCursor == null || typeof data.nextCursor === 'string' && data.nextCursor.length <= 512)) throw new Error('历史列表响应无效，请重试。');
      if (!more) { clearDetail(); clearRows(); }
      data.items.forEach(append); cursor = data.nextCursor || null;
      status(rows.size ? '' : '暂无作品');
    } catch (error) {
      if (version === listVersion && scope.current(ticket)) {
        report(error, ticket);
        if (scope.current(ticket) && error.name !== 'AbortError') $('history-retry').hidden = false;
      }
    } finally { if (scope.current(ticket) && version === listVersion) { listBusy = false; controls(); } }
  }
  async function open(id) {
    if (!loggedIn() || deleteBusy) return;
    clearDetail(); selected = id;
    rows.get(id)?.button.setAttribute('aria-expanded', 'true');
    const version = detailVersion, ticket = scope.capture();
    const current = () => scope.current(ticket) && version === detailVersion && selected === id;
    $('history-detail').hidden = false;
    $('history-detail').showModal();
    $('history-dialog-close').focus();
    $('history-delete').disabled = true; $('history-render').disabled = true;
    status('加载中…', 'history-detail-status');
    try {
      const data = await api(`/history/${id}`, { signal: ticket.signal });
      scope.assert(ticket); if (!current()) return;
      if (data.id !== id) throw new Error('历史详情编号无效。');
      const empty = Array.isArray(data.poem) && data.poem.length === 0 && !data.text && !data.verse;
      const poem = empty ? { title: '', body: '这次任务没有生成诗词正文。', cipai: '' } : poemData(data);
      status(poem.title || '诗词详情', 'history-detail-title'); status(poem.body, 'history-body');
      status(poem.cipai ? `词牌 · ${poem.cipai}` : '', 'history-cipai');
      status(`创作时间：${time(data.createdAt)} · 到期时间：${time(data.expiresAt)}`, 'history-time');
      $('history-delete').disabled = false; $('history-render').disabled = empty;
      $('history-render').onclick = empty ? null : () => void draw(poem, id, version, ticket);
      const blob = await image(id, ticket);
      if (!current()) return;
      detailURL = URL.createObjectURL(blob); $('history-photo').src = detailURL;
      status('', 'history-detail-status');
    } catch (error) {
      if (current()) {
        if ([404, 410].includes(error.status)) { remove(id); clearDetail(); report(error, ticket); $('refresh-history').focus(); }
        else report(error, ticket, 'history-detail-status');
      }
    }
  }
  async function draw(poem, id, version, ticket) {
    if ($('history-render').disabled) return;
    $('history-render').disabled = true;
    status('正在生成分享图…', 'history-export-status');
    try {
      const blob = await renderPoemCard(poem);
      scope.assert(ticket); if (version !== detailVersion || selected !== id) return;
      if (cardURL) URL.revokeObjectURL(cardURL);
      cardURL = URL.createObjectURL(blob);
      $('history-card').src = cardURL; $('history-card').hidden = false;
      $('history-download').href = cardURL; $('history-download').hidden = false;
      status('', 'history-export-status');
    } catch (error) { if (version === detailVersion) report(error, ticket, 'history-export-status'); }
    finally { if (scope.current(ticket) && version === detailVersion) $('history-render').disabled = false; }
  }
  function remove(id) {
    const row = rows.get(id);
    if (row) { observer.unobserve(row.article); row.article.remove(); if (row.url) URL.revokeObjectURL(row.url); rows.delete(id); }
  }
  $('history-delete').addEventListener('click', () => {
    if (!selected || deleteBusy) return;
    $('history-delete-dialog').showModal(); $('history-delete-cancel').focus();
  });
  $('history-delete-cancel').addEventListener('click', () => $('history-delete-dialog').close());
  $('history-delete-confirm').addEventListener('click', async () => {
    if (!$('history-delete-dialog').open || !selected || deleteBusy) return;
    const id = selected, ticket = scope.capture();
    deleteBusy = true; listVersion++; listBusy = false; controls();
    $('history-delete-confirm').disabled = true;
    $('history-delete-dialog').close();
    status('正在永久删除…', 'history-detail-status');
    try {
      const result = await api(`/history/${id}`, { method: 'DELETE', signal: ticket.signal });
      scope.assert(ticket);
      if (result?.deleted !== true) throw new Error('服务尚未确认删除，请重试。');
      remove(id); clearDetail(); status('已永久删除这份历史，无法恢复。'); $('refresh-history').focus();
    } catch (error) {
      if (scope.current(ticket)) {
        if ([404, 410].includes(error.status)) { remove(id); clearDetail(); report(error, ticket); $('refresh-history').focus(); }
        else report(error, ticket, 'history-detail-status');
      }
    } finally {
      if (scope.current(ticket)) { deleteBusy = false; $('history-delete-confirm').disabled = false; controls(); }
    }
  });
  $('history-dialog-close').addEventListener('click', () => { if (!deleteBusy) clearDetail(); });
  $('history-detail').addEventListener('cancel', event => {
    event.preventDefault();
    if (!deleteBusy) clearDetail();
  });
  $('history-detail').addEventListener('click', event => {
    if (event.target !== $('history-detail') || deleteBusy) return;
    const rect = $('history-detail').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) clearDetail();
  });
  $('refresh-history').addEventListener('click', () => void load());
  $('history-more').addEventListener('click', () => void load(true));
  $('history-retry').addEventListener('click', () => void load(retryMore));
  reset();
  return { reset, refresh: () => load() };
}
