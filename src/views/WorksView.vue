<script setup>
import { useSession } from '../composables/useSession.mjs';
import { useHistory } from '../composables/useHistory.mjs';
import SessionGate from '../components/SessionGate.vue';
const session = useSession();
const { t, href, user, time } = session;
const {
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
  retryLoad,
  open,
  close,
  draw,
  remove,
} = useHistory(session);
function backdrop(event) {
  if (event.target === dialog.value) {
    const r = dialog.value.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      close();
  }
}
</script>
<template>
  <main id="main" class="shell" tabindex="-1">
    <section class="create-intro works-intro">
      <div class="works-intro-copy">
        <p class="eyebrow">{{ t('common.eyebrow') }}</p>
        <h1>{{ t('nav.works') }}</h1>
        <p class="lede">{{ t('history.intro') }}</p>
      </div>
      <a :href="href('create.html')" class="button primary">{{ t('create.new') }}</a>
    </section>
    <SessionGate :session="session" />
    <section id="history" class="create-panel history-panel" aria-labelledby="history-title">
      <div class="section-top">
        <h2 id="history-title">{{ t('history.collection') }}</h2>
        <button
          id="refresh-history"
          class="button secondary"
          type="button"
          :disabled="!user || listBusy || deleting"
          @click="load()"
        >
          {{ t('history.refresh') }}
        </button>
      </div>
      <p id="history-status" class="create-status" role="status" aria-live="polite">{{ status }}</p>
      <button id="history-retry" class="button secondary" type="button" :hidden="!retry" @click="retryLoad">
        {{ t('history.retry') }}
      </button>
      <div id="history-list" class="history-grid" :aria-busy="listBusy">
        <article
          v-for="item in rows"
          :key="item.id"
          :ref="observe"
          class="history-item"
          :data-history-id="item.id"
        >
          <button
            type="button"
            class="history-image-toggle"
            :aria-label="t('history.view', { title: item.title || t('common.untitled') })"
            aria-haspopup="dialog"
            :aria-expanded="selected?.id === item.id"
            aria-controls="history-detail"
            @click="open(item.id, $event)"
          >
            <img :src="item.url || undefined" :alt="item.alt" loading="lazy" width="240" height="400" />
          </button>
          <div class="history-item-copy">
            <h3 class="history-item-title">{{ item.title || t('common.untitled') }}</h3>
            <p class="history-excerpt">{{ item.excerpt }}</p>
            <p class="fine-print">{{ time(item.createdAt) }}</p>
          </div>
        </article>
      </div>
      <button
        id="history-more"
        class="button secondary"
        type="button"
        :hidden="!cursor"
        :disabled="listBusy || deleting"
        @click="load(true)"
      >
        {{ t('history.more') }}
      </button>
      <dialog
        id="history-detail"
        ref="dialog"
        class="history-detail"
        aria-labelledby="history-detail-title"
        @cancel.prevent="close"
        @click="backdrop"
      >
        <div class="section-top">
          <h3 id="history-detail-title">{{ selected?.poem?.title || t('history.detail') }}</h3>
          <button
            id="history-dialog-close"
            class="history-dialog-close"
            type="button"
            :aria-label="t('history.close')"
            autofocus
            @click="close"
          >
            ×
          </button>
        </div>
        <p id="history-time" class="fine-print">
          {{
            selected?.createdAt
              ? t('history.time', { created: time(selected.createdAt), expires: time(selected.expiresAt) })
              : ''
          }}
        </p>
        <p id="history-detail-status" class="create-status" role="status" aria-live="polite">
          {{ detailStatus }}
        </p>
        <img id="history-photo" :src="photoURL || undefined" :alt="t('history.photoAlt')" />
        <div class="poem-text">
          <p id="history-cipai">
            {{ selected?.poem?.cipai ? t('common.cipai', { name: selected.poem.cipai }) : '' }}
          </p>
          <p id="history-body">{{ selected?.poem?.body }}</p>
        </div>
        <div class="actions">
          <button
            id="history-render"
            class="button secondary"
            type="button"
            :disabled="!selected?.poem || selected?.empty || drawing"
            @click="draw"
          >
            {{ t('common.render') }}</button><a
            id="history-download"
            class="button primary"
            :href="cardURL || undefined"
            download="picpoet-history-poem.png"
            :hidden="!cardURL"
            >{{ t('history.download') }}</a
          ><button
            id="history-delete"
            class="button secondary"
            type="button"
            :disabled="!selected?.poem || deleting"
            @click="deleteDialog.showModal()"
          >
            {{ t('history.delete') }}
          </button>
        </div>
        <p id="history-export-status" class="create-status" role="status" aria-live="polite">
          {{ exportStatus }}
        </p>
        <img id="history-card" :src="cardURL || undefined" :alt="t('history.cardAlt')" :hidden="!cardURL" />
      </dialog>
      <dialog
        id="history-delete-dialog"
        ref="deleteDialog"
        aria-labelledby="history-delete-title"
        aria-describedby="history-delete-description"
      >
        <h3 id="history-delete-title">{{ t('history.deleteTitle') }}</h3>
        <p id="history-delete-description">{{ t('history.deleteHelp') }}</p>
        <div class="actions">
          <button
            id="history-delete-cancel"
            class="button secondary"
            type="button"
            autofocus
            @click="deleteDialog.close()"
          >
            {{ t('history.keep') }}</button><button
            id="history-delete-confirm"
            class="button primary"
            type="button"
            :disabled="deleting"
            @click="remove"
          >
            {{ t('history.confirmDelete') }}
          </button>
        </div>
      </dialog>
    </section>
  </main>
</template>
