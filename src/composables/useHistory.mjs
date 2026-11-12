import { ref, shallowRef, watch, nextTick, onBeforeUnmount } from 'vue';
import { ApiError, UUID } from '../../shared/create-core.mjs';
import { poemData, renderPoemCard } from '../../shared/poem-card.mjs';

export function useHistory(session) {
  const { t, api, scope, user, failure, error, brand } = session;
  const rows = ref([]),
    cursor = ref(null),
    listBusy = ref(false),
    status = ref(t('history.login')),
    retry = ref(false);
  const selected = shallowRef(null),
    detailStatus = ref(''),
    exportStatus = ref(''),
    photoURL = ref(''),
    cardURL = ref('');
  const deleting = ref(false),
    drawing = ref(false),
    dialog = ref(),
    deleteDialog = ref();
  let listVersion = 0,
    detailVersion = 0,
    retryMore = false,
    observer,
    trigger;
  const release = (value) => {
    if (value) URL.revokeObjectURL(value);
  };
  function clearDetail() {
    detailVersion++;
    dialog.value?.close();
    deleteDialog.value?.close();
    selected.value = null;
    release(photoURL.value);
    release(cardURL.value);
    photoURL.value = '';
    cardURL.value = '';
    detailStatus.value = '';
    exportStatus.value = '';
    drawing.value = false;
    if (trigger?.isConnected) trigger.focus();
  }
  function clearRows() {
    observer?.disconnect();
    for (const row of rows.value) release(row.url);
    rows.value = [];
  }
  function reset() {
    listVersion++;
    clearDetail();
    clearRows();
    cursor.value = null;
    listBusy.value = false;
    deleting.value = false;
    status.value = t('history.login');
    retry.value = false;
  }
  session.resets.add(reset);
  const report = (cause) =>
    cause.status === 503
      ? t('history.unavailable')
      : [404, 410].includes(cause.status)
        ? t('history.gone')
        : error(cause);
  function unauthorized(cause) {
    if (cause.status !== 401) return false;
    session.reset();
    session.ready.value = true;
    session.status.value = t('http.s401');
    return true;
  }
  async function image(id, ticket) {
    scope.assert(ticket);
    const controller = new AbortController(),
      abort = () => controller.abort();
    ticket.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 20_000);
    try {
      const response = await fetch(`/web-api/history/${id}/image`, {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new ApiError(response.status);
      if (
        !/^image\/jpeg(?:\s*;|$)/i.test(response.headers.get('content-type') || '') ||
        Number(response.headers.get('content-length')) > 2 * 1024 * 1024
      )
        throw failure('history.invalidImage');
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          controller.abort();
          throw failure('history.imageSize');
        }
        chunks.push(chunk);
      }
      scope.assert(ticket);
      return new Blob(chunks, { type: 'image/jpeg' });
    } catch (cause) {
      scope.assert(ticket);
      if (controller.signal.aborted && cause.name === 'AbortError') throw new ApiError(504);
      throw cause;
    } finally {
      clearTimeout(timer);
      ticket.signal.removeEventListener('abort', abort);
    }
  }
  async function thumbnail(id) {
    const ticket = scope.capture();
    const row = rows.value.find((item) => item.id === id);
    if (!row || row.url || row.loading) return;
    row.loading = true;
    try {
      const blob = await image(id, ticket);
      if (scope.current(ticket) && rows.value.includes(row)) row.url = URL.createObjectURL(blob);
    } catch (cause) {
      if (scope.current(ticket) && !unauthorized(cause)) row.alt = t('history.imageUnavailable');
    }
  }
  function observe(element) {
    if (!element) return;
    observer ||= new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            void thumbnail(entry.target.dataset.historyId);
          }
      },
      { rootMargin: '160px' },
    );
    observer.observe(element);
  }
  async function load(more = false) {
    if (!user.value || deleting.value || listBusy.value || (more && !cursor.value)) return;
    const ticket = scope.capture(),
      version = ++listVersion,
      after = more ? cursor.value : null;
    listBusy.value = true;
    retry.value = false;
    retryMore = more;
    status.value = t('common.loading');
    try {
      const data = await api(`/history?limit=20${after ? '&cursor=' + encodeURIComponent(after) : ''}`, {
        signal: ticket.signal,
      });
      scope.assert(ticket);
      if (version !== listVersion) return;
      if (
        !Array.isArray(data?.items) ||
        !data.items.every(
          (item) => UUID.test(item.id) && typeof item.title === 'string' && typeof item.excerpt === 'string',
        ) ||
        !(data.nextCursor == null || (typeof data.nextCursor === 'string' && data.nextCursor.length <= 512))
      )
        throw failure('history.invalidList');
      if (!more) {
        clearDetail();
        clearRows();
      }
      const seen = new Set(rows.value.map((item) => item.id));
      rows.value.push(
        ...data.items
          .filter((item) => !seen.has(item.id))
          .map((item) => ({ ...item, url: '', alt: '', loading: false })),
      );
      cursor.value = data.nextCursor || null;
      status.value = rows.value.length ? '' : t('history.empty');
    } catch (cause) {
      if (scope.current(ticket) && version === listVersion && cause.name !== 'AbortError') {
        if (!unauthorized(cause)) {
          status.value = report(cause);
          retry.value = true;
        }
      }
    } finally {
      if (scope.current(ticket) && version === listVersion) listBusy.value = false;
    }
  }
  async function open(id, event) {
    if (!user.value || deleting.value) return;
    clearDetail();
    trigger = event.currentTarget;
    selected.value = { id };
    const version = detailVersion,
      ticket = scope.capture();
    await nextTick();
    if (!scope.current(ticket) || version !== detailVersion) return;
    dialog.value.showModal();
    detailStatus.value = t('common.loading');
    const current = () => scope.current(ticket) && version === detailVersion && selected.value?.id === id;
    try {
      const data = await api(`/history/${id}`, { signal: ticket.signal });
      scope.assert(ticket);
      if (!current()) return;
      if (data.id !== id) throw failure('history.invalidDetail');
      const empty = Array.isArray(data.poem) && !data.poem.length && !data.verse && !data.text;
      selected.value = {
        ...data,
        poem: empty ? { title: '', body: t('common.emptyBody') } : poemData(data),
        empty,
      };
      const blob = await image(id, ticket);
      if (!current()) return;
      photoURL.value = URL.createObjectURL(blob);
      detailStatus.value = '';
    } catch (cause) {
      if (current() && cause.name !== 'AbortError' && !unauthorized(cause))
        detailStatus.value = report(cause);
    }
  }
  async function draw() {
    if (!selected.value?.poem || selected.value.empty || drawing.value) return;
    const source = selected.value,
      version = detailVersion,
      ticket = scope.capture();
    drawing.value = true;
    exportStatus.value = t('common.rendering');
    try {
      const blob = await renderPoemCard(source.poem, { brand });
      scope.assert(ticket);
      if (version !== detailVersion || selected.value !== source) return;
      release(cardURL.value);
      cardURL.value = URL.createObjectURL(blob);
      exportStatus.value = '';
    } catch (cause) {
      if (scope.current(ticket) && version === detailVersion && cause.name !== 'AbortError')
        exportStatus.value = report(cause);
    } finally {
      if (version === detailVersion) drawing.value = false;
    }
  }
  async function remove() {
    if (!selected.value || deleting.value || !deleteDialog.value.open) return;
    const id = selected.value.id;
    deleting.value = true;
    deleteDialog.value.close();
    const ticket = scope.capture();
    detailStatus.value = t('history.deleting');
    try {
      const data = await api(`/history/${id}`, { method: 'DELETE', body: {}, signal: ticket.signal });
      scope.assert(ticket);
      if (data?.deleted !== true) throw failure('history.deletePending');
      for (const row of rows.value.filter((item) => item.id === id)) release(row.url);
      rows.value = rows.value.filter((item) => item.id !== id);
      clearDetail();
      status.value = t('history.deleted');
      await nextTick();
      document.getElementById('refresh-history')?.focus();
    } catch (cause) {
      if (scope.current(ticket) && cause.name !== 'AbortError' && !unauthorized(cause))
        detailStatus.value = report(cause);
    } finally {
      if (scope.current(ticket)) deleting.value = false;
    }
  }
  watch(user, (value) => {
    if (value) void load();
  });
  onBeforeUnmount(() => {
    session.resets.delete(reset);
    reset();
  });
  return {
    rows,
    cursor,
    listBusy,
    status,
    retry,
    selected,
    detailStatus,
    exportStatus,
    photoURL,
    cardURL,
    deleting,
    drawing,
    dialog,
    deleteDialog,
    observe,
    load,
    retryLoad: () => load(retryMore),
    open,
    close: () => {
      if (!deleting.value) clearDetail();
    },
    draw,
    remove,
  };
}
