<script setup>
import { useSite } from '../i18n/context.mjs';
const { t, href } = useSite();
</script>
<template>
  <main id="main" class="shell" tabindex="-1">
    <section class="page-header">
      <p class="eyebrow">{{ t('content.pricing.t001') }}</p>
      <h1>{{ t('content.pricing.t002') }}<br />{{ t('content.pricing.t003') }}</h1>
      <p class="lede">{{ t('content.pricing.t004') }}</p>
    </section>
    <aside class="notice">
      <h2>{{ t('content.pricing.t005') }}</h2>
      <p>
        {{ t('content.pricing.t006')
        }}<a :href="href('account.html#purchase')">{{ t('content.pricing.t007') }}</a
        >{{ t('content.pricing.t008') }}
      </p>
    </aside>
    <div class="content-grid">
      <aside class="side-nav">
        <nav :aria-label="t('content.pricing.t053')">
          <a :href="href('#local')">{{ t('content.pricing.t009') }}</a><a :href="href('#cloud')">{{
            t('content.pricing.t010')
          }}</a
          ><a :href="href('#compare')">{{ t('content.pricing.t011') }}</a>
        </nav>
      </aside>
      <div class="content">
        <section id="local" class="price-card">
          <p class="eyebrow">{{ t('content.pricing.t012') }}</p>
          <h2>{{ t('content.pricing.t013') }}</h2>
          <p>{{ t('content.pricing.t014') }}</p>
          <ul>
            <li>{{ t('content.pricing.t015') }}</li>
            <li>{{ t('content.pricing.t016') }}</li>
            <li>{{ t('content.pricing.t017') }}</li>
            <li>{{ t('content.pricing.t018') }}</li>
          </ul>
          <p class="fine-print">{{ t('content.pricing.t019') }}</p>
          <a class="button primary" :href="href('downloads.html')">{{ t('content.pricing.t020') }}</a>
        </section>
        <section id="cloud">
          <h2>{{ t('content.pricing.t021') }}</h2>
          <h3>{{ t('content.pricing.t022') }}</h3>
          <p>{{ t('content.pricing.t023') }}</p>
          <h3>{{ t('content.pricing.t024') }}</h3>
          <p>{{ t('content.pricing.t025') }}</p>
          <h3>{{ t('content.pricing.t026') }}</h3>
          <p>{{ t('content.pricing.t027') }}</p>
          <div class="notice">
            <h3>{{ t('content.pricing.t028') }}</h3>
            <p>{{ t('content.pricing.t029') }}</p>
            <a class="text-link" :href="href('docs.html#privacy')"
              >{{ t('content.pricing.t030') }}<span aria-hidden="true">→</span></a
            >
          </div>
        </section>
        <section id="compare">
          <h2>{{ t('content.pricing.t031') }}</h2>
          <div class="table-wrap" role="region" aria-labelledby="model-comparison" tabindex="0">
            <table class="pricing-table">
              <caption id="model-comparison">
                {{
                  t('content.pricing.t032')
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{{ t('content.pricing.t033') }}</th>
                  <th scope="col">{{ t('content.pricing.t034') }}</th>
                  <th scope="col">{{ t('content.pricing.t035') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{{ t('content.pricing.t036') }}</th>
                  <td>{{ t('content.pricing.t037') }}</td>
                  <td>{{ t('content.pricing.t038') }}</td>
                </tr>
                <tr>
                  <th scope="row">{{ t('content.pricing.t039') }}</th>
                  <td>{{ t('content.pricing.t040') }}</td>
                  <td>{{ t('content.pricing.t041') }}</td>
                </tr>
                <tr>
                  <th scope="row">{{ t('content.pricing.t042') }}</th>
                  <td>{{ t('content.pricing.t043') }}</td>
                  <td>{{ t('content.pricing.t044') }}</td>
                </tr>
                <tr>
                  <th scope="row">{{ t('content.pricing.t045') }}</th>
                  <td>{{ t('content.pricing.t046') }}</td>
                  <td>{{ t('content.pricing.t047') }}</td>
                </tr>
                <tr>
                  <th scope="row">{{ t('content.pricing.t048') }}</th>
                  <td>{{ t('content.pricing.t049') }}</td>
                  <td>{{ t('content.pricing.t050') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="actions">
            <a class="button secondary" :href="href('docs.html#config')">{{ t('content.pricing.t051') }}</a><a
              class="text-link"
              :href="href('docs.html#website')"
              >{{ t('content.pricing.t052') }}<span aria-hidden="true">→</span></a
            >
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
