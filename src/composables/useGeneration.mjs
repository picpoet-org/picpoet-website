import { ref, shallowRef, watch, onBeforeUnmount } from 'vue';
import {
  createScope,
  generationAttempt,
  generationForm,
  prepareImage,
  pollGeneration,
  UUID,
} from '../../shared/create-core.mjs';
import { poemData, renderPoemCard } from '../../shared/poem-card.mjs';

export function useGeneration(session) {
  const { t, scope, action, request, api, user, verified, busy, balance, failure, brand } = session;
  const image = shallowRef(null),
    photoURL = ref(''),
    caption = ref(''),
    imageStatus = ref('');
  const task = shallowRef(null),
    polling = ref(false),
    generationStatus = ref(t('session.verifyFirst'));
  const poem = shallowRef(null),
    expiry = ref(''),
    cardURL = ref(''),
    cardStatus = ref(''),
    canShare = ref(false);
  const pollScope = createScope();
  let cardBlob = null,
    imageVersion = 0;
  const release = (url) => {
    if (url) URL.revokeObjectURL(url);
  };
  function clearCard() {
    release(cardURL.value);
    cardURL.value = '';
    cardBlob = null;
    canShare.value = false;
  }
  function clearResult() {
    clearCard();
    poem.value = null;
    expiry.value = '';
    cardStatus.value = '';
  }
  function reset() {
    imageVersion++;
    pollScope.reset();
    release(photoURL.value);
    photoURL.value = '';
    caption.value = '';
    image.value = null;
    task.value = null;
    polling.value = false;
    clearResult();
    imageStatus.value = '';
    generationStatus.value = t('session.verifyFirst');
  }
  session.resets.add(reset);
  function setTask(id, attempt = null) {
    if (!UUID.test(id)) throw failure('create.invalidTask');
    pollScope.reset();
    clearResult();
    task.value = { id, attempt, terminal: false, status: 'unknown' };
  }
  async function pick(event) {
    if (task.value || !verified.value) return;
    const file = event.target.files?.[0];
    const version = ++imageVersion;
    image.value = null;
    release(photoURL.value);
    photoURL.value = '';
    if (!file) return;
    await action('image', imageStatus, async (ticket) => {
      imageStatus.value = t('create.processing');
      const result = await prepareImage(file);
      scope.assert(ticket);
      if (version !== imageVersion) return;
      image.value = result;
      photoURL.value = URL.createObjectURL(result.blob);
      caption.value = `${result.width} × ${result.height} · JPEG · ${(result.blob.size / 1024).toFixed(0)} KiB`;
      imageStatus.value = '';
    });
  }
  async function draw(ticket = scope.capture()) {
    if (!poem.value || busy.has('card')) return;
    const source = poem.value,
      target = task.value;
    await action('card', cardStatus, async () => {
      clearCard();
      cardStatus.value = t('common.rendering');
      const blob = await renderPoemCard(source, { brand });
      scope.assert(ticket);
      if (poem.value !== source || task.value !== target) return;
      cardBlob = blob;
      cardURL.value = URL.createObjectURL(blob);
      const file = new File([blob], 'picpoet-poem.png', { type: 'image/png' });
      canShare.value = typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] });
      cardStatus.value = '';
    });
  }
  async function monitor(ticket) {
    pollScope.reset();
    const pollTicket = pollScope.capture(),
      target = task.value;
    polling.value = true;
    try {
      const result = await pollGeneration({
        signal: pollTicket.signal,
        read: async () => {
          const data = await api(`/generations/${target.id}`, { signal: pollTicket.signal });
          scope.assert(ticket);
          pollScope.assert(pollTicket);
          return data;
        },
        onStatus: (status) => {
          task.value = { ...target, status: status.status };
          generationStatus.value = t('create.' + status.status);
        },
      });
      scope.assert(ticket);
      pollScope.assert(pollTicket);
      if (result.status === 'paused') {
        generationStatus.value = t('create.paused');
        return;
      }
      task.value = { ...task.value, terminal: true };
      if (result.status === 'succeeded') {
        const completedTask = task.value;
        const data = await request(ticket, `/generations/${target.id}/result`);
        if (task.value !== completedTask) return;
        poem.value = poemData(data);
        expiry.value = result.resultAvailableUntil
          ? t('create.expiry', { time: session.time(result.resultAvailableUntil) })
          : t('create.expiryUnknown');
        generationStatus.value = '';
        await draw(ticket);
      }
      await session.refreshBalance(ticket);
    } finally {
      if (scope.current(ticket)) polling.value = false;
    }
  }
  function query() {
    if (task.value && user.value) return action('task', generationStatus, monitor);
  }
  function submit() {
    return action('task', generationStatus, async (ticket) => {
      if (!verified.value) throw failure('session.verifyFirst');
      if (!task.value) {
        const attempt = generationAttempt(image.value?.blob, 'zh');
        setTask(attempt.id, attempt);
      }
      if (!task.value.attempt) throw failure('create.recovered');
      generationStatus.value = t('create.uploading');
      const accepted = await request(ticket, '/generations', generationForm(task.value.attempt));
      if (accepted?.id !== task.value.id) throw failure('create.taskMismatch');
      await monitor(ticket);
    });
  }
  function pause() {
    pollScope.reset();
    generationStatus.value = t('create.paused');
  }
  function newTask() {
    if (!task.value?.terminal || busy.has('task') || busy.has('card')) return;
    pollScope.reset();
    task.value = null;
    clearResult();
    generationStatus.value = '';
  }
  async function share() {
    await action('share', cardStatus, async (ticket) => {
      if (!cardBlob) return;
      try {
        await navigator.share({
          files: [new File([cardBlob], 'picpoet-poem.png', { type: 'image/png' })],
          title: t('create.shareTitle'),
        });
        scope.assert(ticket);
        cardStatus.value = t('create.shared');
      } catch (error) {
        if (error.name === 'AbortError' && scope.current(ticket))
          cardStatus.value = t('create.shareCancelled');
        else throw error;
      }
    });
  }
  watch(user, (value) => {
    if (value) void action('balance', session.status, (ticket) => session.refreshBalance(ticket));
  });
  watch(balance, (value) => {
    if (value?.activeGenerationId && value.activeGenerationId !== task.value?.id && !busy.has('task')) {
      setTask(value.activeGenerationId);
      generationStatus.value = t('create.recovering');
      void query();
    }
  });
  onBeforeUnmount(() => {
    session.resets.delete(reset);
    reset();
  });
  return {
    image,
    photoURL,
    caption,
    imageStatus,
    task,
    polling,
    generationStatus,
    poem,
    expiry,
    cardURL,
    cardStatus,
    canShare,
    pick,
    draw,
    query,
    submit,
    pause,
    newTask,
    share,
  };
}
