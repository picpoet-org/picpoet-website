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
const { page } = useSite();
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
<template><SiteHeader /><component :is="views[page]" /><SiteFooter /></template>
