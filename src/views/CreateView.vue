<script setup>
import { useSession } from '../composables/useSession.mjs';
import { useGeneration } from '../composables/useGeneration.mjs';
import SessionGate from '../components/SessionGate.vue';
import WaitingPoems from '../components/WaitingPoems.vue';
const session = useSession();
const { t, href, asset, verified, busy, balance } = session;
const {
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
} = useGeneration(session);
</script>
<template>
  <main id="main" class="shell" tabindex="-1">
    <section class="create-intro">
      <p class="eyebrow">{{ t('common.eyebrow') }}</p>
      <h1>{{ t('create.title') }}</h1>
      <p class="lede">{{ t('create.intro') }}</p>
    </section>
    <SessionGate :session="session" />
    <div class="creation-toolbar">
      <p id="balance">
        {{
          balance
            ? t('session.balance', { free: balance.free.remaining, paid: balance.paid.remaining })
            : t('create.balance')
        }}
      </p>
      <button
        id="refresh-balance"
        class="button secondary"
        type="button"
        :disabled="!verified || busy.has('balance')"
        @click="session.action('balance', session.status, (ticket) => session.refreshBalance(ticket))"
      >
        {{ t('create.refresh') }}</button><a class="text-link" :href="href('account.html#purchase')">{{
        t('create.manage')
      }}</a
      ><a class="text-link" :href="href('works.html')">{{ t('create.works') }}</a>
    </div>
    <div class="create-workspace">
      <div class="create-controls">
        <section class="create-panel" aria-labelledby="compose-title">
          <h2 id="compose-title">{{ t('create.compose') }}</h2>
          <form id="create-form" @submit.prevent="!task && submit()">
            <fieldset id="generation-inputs" :disabled="!verified || !!task || busy.has('image')">
              <div class="image-picker">
                <label for="image">{{ t('create.pick') }}</label><input
                  id="image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  aria-describedby="image-help"
                  @change="pick"
                />
                <p id="image-help" class="fine-print">{{ t('create.imageHelp') }}</p>
              </div>
              <figure id="photo-preview" :hidden="!photoURL">
                <img id="photo" :src="photoURL || undefined" :alt="t('create.photoAlt')" />
                <figcaption id="photo-caption">{{ caption }}</figcaption>
              </figure>
              <button
                id="generate"
                type="submit"
                class="button primary"
                :disabled="!image || !verified || !!task || busy.has('image')"
              >
                {{
                  t(
                    busy.has('image')
                      ? 'create.processing'
                      : busy.has('task')
                        ? 'create.creating'
                        : 'create.generate',
                  )
                }}
              </button>
            </fieldset>
          </form>
          <p id="image-status" class="fine-print" role="status" aria-live="polite">{{ imageStatus }}</p>
          <p id="generation-status" class="create-status" role="status" aria-live="polite" aria-atomic="true">
            {{ generationStatus }}
          </p>
          <WaitingPoems :active="polling && ['queued', 'running'].includes(task?.status)" />
          <div class="actions task-actions">
            <button id="stop-poll" class="button secondary" type="button" :hidden="!polling" @click="pause">
              {{ t('create.pause') }}</button><button
              id="resume-generation"
              class="button secondary"
              type="button"
              :hidden="!task || busy.has('task')"
              @click="query"
            >
              {{ t('create.resume') }}</button
            ><button
              id="retry-generation"
              class="button secondary"
              type="button"
              :hidden="!task?.attempt || busy.has('task') || task?.terminal"
              @click="submit"
            >
              {{ t('create.retry') }}</button
            ><button
              id="new-generation"
              class="button secondary"
              type="button"
              :hidden="!task?.terminal || busy.has('task')"
              :disabled="busy.has('card')"
              @click="newTask"
            >
              {{ t('create.new') }}
            </button>
          </div>
          <details id="task-details" :hidden="!task">
            <summary>{{ t('create.taskDetails') }}</summary>
            <p id="generation-id" class="request-id">{{ task ? t('create.taskId', { id: task.id }) : '' }}</p>
            <p class="fine-print">{{ t('create.taskHelp') }}</p>
          </details>
        </section>
      </div>
      <section class="create-panel result-panel" aria-labelledby="result-title">
        <h2 id="result-title">{{ t('create.result') }}</h2>
        <div id="result-empty" class="empty-page" :hidden="!!poem">
          <p class="preview-label">{{ t('create.preview') }}</p>
          <img
            class="preview-mark"
            :src="asset('assets/picpoet-mark.svg')"
            width="48"
            height="48"
            alt=""
            aria-hidden="true"
          /><span class="empty-title">{{ t('create.emptyTitle') }}</span>
          <p>{{ t('create.emptyHelp') }}</p>
        </div>
        <div id="result-content" :hidden="!poem">
          <p id="result-expiry" class="fine-print">{{ expiry }}</p>
          <figure id="card-preview" :hidden="!cardURL">
            <img id="poem-card" :src="cardURL || undefined" :alt="t('create.cardAlt')" />
          </figure>
          <p id="card-status" class="create-status" role="status" aria-live="polite">{{ cardStatus }}</p>
          <div class="actions">
            <a
              id="download-card"
              class="button primary"
              :href="cardURL || undefined"
              download="picpoet-poem.png"
              :hidden="!cardURL"
              >{{ t('common.download') }}</a><button
              id="share-card"
              class="button secondary"
              type="button"
              :hidden="!canShare"
              :disabled="busy.has('share')"
              @click="share"
            >
              {{ t('create.share') }}</button
            ><button
              id="redraw-card"
              class="button secondary"
              type="button"
              :disabled="busy.has('card')"
              @click="draw()"
            >
              {{ t('create.redraw') }}
            </button>
          </div>
          <section class="poem-text" :aria-label="t('create.fullPoem')">
            <h3 id="poem-title">{{ poem?.title }}</h3>
            <p id="poem-cipai">{{ poem?.cipai ? t('common.cipai', { name: poem.cipai }) : '' }}</p>
            <p id="poem-body">{{ poem?.body }}</p>
          </section>
        </div>
      </section>
    </div>
  </main>
</template>
