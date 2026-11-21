import { useShareImageOptions } from './useShareImageOptions.mjs';
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  createScope,
  generationAttempt,
  generationForm,
  prepareImage,
  pollGeneration,
  UUID,
} from '../../shared/create-core.mjs';
import { poemPlainText, renderPoemCard } from '../../shared/poem-card.mjs';
import { generationResult } from '../../shared/generation-result.mjs';
import { photoSource, shareFile } from '../../shared/photo-source.mjs';
import { useGenerationPreferences } from './useGenerationPreferences.mjs';

export function useGeneration(session) {
  const { t, scope, action, request, api, user, verified, busy, balance, failure, brand } = session;
  const preferences = useGenerationPreferences(session);
  const hasGenerationContent = computed(
    () => preferences.value.value.photoInfo || !!preferences.value.value.poem || !!preferences.value.value.ci,
  );
  const resultInfo = shallowRef(null);
  const shareOptions = useShareImageOptions(redrawCard);
  const { includeInvitation, includePhoto, fillPhoto } = shareOptions;
  const image = shallowRef(null),
    photoURL = ref(''),
    caption = ref(''),
    imageStatus = ref('');
  const task = shallowRef(null),
    polling = ref(false),
    // 登录与邮箱验证提示由 SessionGate 管理，此处仅维护创作任务状态。
    generationStatus = ref('');
  const poem = shallowRef(null),
    expiry = ref(''),
    cardURL = ref(''),
    cardStatus = ref(''),
    canShare = ref(false);
  // 恢复的服务端任务不一定对应页面上最近选择的照片。
  const cardPhotoURL = computed(() =>
    task.value?.attempt && task.value.attempt.image === image.value?.blob ? photoURL.value : '',
  );
  const copyStatus = ref(''),
    copyFallback = ref(false);
  const poemText = computed(() => (poem.value ? poemPlainText(poem.value) : ''));
  const pollScope = createScope();
  const cardFile = shallowRef(null);
  const cardName = computed(() => cardFile.value?.name || 'PicPoet.png');
  let imageVersion = 0;
  const release = (url) => {
    if (url) URL.revokeObjectURL(url);
  };
  function clearCard() {
    release(cardURL.value);
    cardURL.value = '';
    cardFile.value = null;
    canShare.value = false;
  }
  function clearResult() {
    shareOptions.reset();
    clearCard();
    poem.value = null;
    resultInfo.value = null;
    expiry.value = '';
    cardStatus.value = '';
    copyStatus.value = '';
    copyFallback.value = false;
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
    generationStatus.value = '';
  }
  session.resets.add(reset);
  function setTask(id, attempt = null) {
    if (!UUID.test(id)) throw failure('create.invalidTask');
    pollScope.reset();
    clearResult();
    task.value = { id, attempt, terminal: false, status: 'unknown' };
  }
  async function pick(event) {
    if (task.value || busy.has('task') || !verified.value) return;
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
      const invitationURL = includeInvitation.value ? await session.ensureInvitationURL(ticket) : '';
      const blob = await renderPoemCard(source, {
        brand,
        fillPhoto: fillPhoto.value,
        photoURL: includePhoto.value ? cardPhotoURL.value : '',
        photoDateTime: target.source.photoDateTime,
        invitationURL,
        invitationLabel: t('sharing.scan'),
      });
      scope.assert(ticket);
      if (poem.value !== source || task.value !== target) return;
      const file = shareFile(blob, target.source);
      cardFile.value = file;
      cardURL.value = URL.createObjectURL(file);
      canShare.value = typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] });
      cardStatus.value = !includeInvitation.value || invitationURL ? '' : t('sharing.noInvitation');
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
          generationStatus.value = t(
            (['queued', 'running'].includes(status.status) ? 'waiting.' : 'create.') + status.status,
          );
        },
      });
      scope.assert(ticket);
      pollScope.assert(pollTicket);
      if (result.status === 'paused') {
        generationStatus.value = t('waiting.paused');
        return;
      }
      task.value = { ...task.value, terminal: true };
      if (result.status === 'succeeded') {
        const completedTask = task.value;
        const data = await request(ticket, `/generations/${target.id}/result`);
        if (task.value !== completedTask) return;
        task.value = { ...completedTask, source: completedTask.attempt?.source ?? photoSource(data) };
        resultInfo.value = generationResult(data);
        poem.value = resultInfo.value.poem;
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
        const snapshot = await preferences.snapshot();
        scope.assert(ticket);
        if (!snapshot.photoInfo && !snapshot.poem && !snapshot.ci) throw failure('preferences.enableContent');
        const attempt = generationAttempt(image.value, snapshot);
        setTask(attempt.id, attempt);
      }
      if (!task.value.attempt) throw failure('create.recovered');
      generationStatus.value = t('waiting.uploading');
      let accepted;
      try {
        accepted = await request(ticket, '/generations', generationForm(task.value.attempt));
      } catch (error) {
        // 满载拒绝时任务未创建，保留原请求编号，用户稍后可直接重试。
        if (error?.status === 429 && error.code === 'RATE_LIMITED') throw failure('create.busy');
        throw error;
      }
      if (accepted?.id !== task.value.id) throw failure('create.taskMismatch');
      await monitor(ticket);
    });
  }
  function pause() {
    pollScope.reset();
    generationStatus.value = t('waiting.paused');
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
      if (!cardFile.value) return;
      try {
        await navigator.share({
          files: [cardFile.value],
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
  async function copy() {
    const source = poem.value;
    if (!source) return;
    await action('copy', copyStatus, async (ticket) => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(poemPlainText(source));
        scope.assert(ticket);
        if (poem.value !== source) return;
        copyFallback.value = false;
        copyStatus.value = t('sharing.copied');
      } catch {
        scope.assert(ticket);
        if (poem.value !== source) return;
        copyFallback.value = true;
        copyStatus.value = t('sharing.copyManually');
      }
    });
  }
  function restoreTask(value) {
    if (value?.activeGenerationId && value.activeGenerationId !== task.value?.id && !busy.has('task')) {
      setTask(value.activeGenerationId);
      generationStatus.value = t('create.recovering');
      void query();
    }
  }
  watch(balance, restoreTask);
  onMounted(() => restoreTask(balance.value));
  onBeforeUnmount(() => {
    session.resets.delete(reset);
    reset();
  });
  async function redrawCard() {
    clearCard();
    await draw();
  }
  return {
    resultInfo,
    hasGenerationContent,
    preferencesStatus: preferences.status,
    cardPhotoURL,
    includePhoto,
    fillPhoto,
    includeInvitation,
    setFillPhoto: shareOptions.setFillPhoto,
    setIncludePhoto: shareOptions.setIncludePhoto,
    setIncludeInvitation: shareOptions.setIncludeInvitation,
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
    cardName,
    cardStatus,
    copyStatus,
    copyFallback,
    poemText,
    canShare,
    pick,
    draw,
    query,
    submit,
    pause,
    newTask,
    share,
    copy,
  };
}
