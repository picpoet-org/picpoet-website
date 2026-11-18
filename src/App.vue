<script setup>
import SiteHeader from './components/SiteHeader.vue';
import SiteFooter from './components/SiteFooter.vue';
import IndexView from './views/IndexView.vue';
import DocsView from './views/DocsView.vue';
import PricingView from './views/PricingView.vue';
import DownloadsView from './views/DownloadsView.vue';
import CreateView from './views/CreateView.vue';
import LoginView from './views/LoginView.vue';
import WorksView from './views/WorksView.vue';
import AccountView from './views/AccountView.vue';
import { useSite } from './i18n/context.mjs';
import { provideSession } from './composables/useSession.mjs';
import { useRoute } from 'vue-router';
const route = useRoute();
const site = useSite();
provideSession();
const views = {
  index: IndexView,
  docs: DocsView,
  pricing: PricingView,
  downloads: DownloadsView,
  create: CreateView,
  login: LoginView,
  works: WorksView,
  account: AccountView,
};
</script>
<template>
  <SiteHeader /><component
    :is="views[site.page]"
    :key="route.path + JSON.stringify(route.query)"
  /><SiteFooter />
</template>
