<script setup>
import { useSite } from '../i18n/context.mjs';
const { t, href } = useSite();
</script>
<template>
  <main id="main" class="shell" tabindex="-1">
    <section class="page-header">
      <p class="eyebrow">{{ t('content.docs.t001') }}</p>
      <h1>{{ t('content.docs.t002') }}<br />{{ t('content.docs.t003') }}</h1>
      <p class="lede">{{ t('content.docs.t004') }}</p>
    </section>
    <div class="content-grid">
      <aside class="side-nav">
        <nav :aria-label="t('content.docs.t111')">
          <a :href="href('#website')">{{ t('content.docs.t005') }}</a>
          <a :href="href('#website-create')">{{ t('content.docs.t006') }}</a>
          <a :href="href('#website-works')">{{ t('content.docs.t007') }}</a>
          <a :href="href('#website-account')">{{ t('content.docs.t008') }}</a>
          <a :href="href('#website-share')">{{ t('content.docs.t009') }}</a>
          <a :href="href('#app')">{{ t('content.docs.t010') }}</a>
          <a :href="href('#config')">{{ t('content.docs.t011') }}</a>
          <a :href="href('#app-create')">{{ t('content.docs.t012') }}</a>
          <a :href="href('#app-save')">{{ t('content.docs.t013') }}</a>
          <a :href="href('#app-history')">{{ t('content.docs.t014') }}</a>
          <a :href="href('#privacy')">{{ t('content.docs.t015') }}</a>
        </nav>
      </aside>
      <div class="content">
        <section id="website">
          <p class="eyebrow">{{ t('content.docs.t016') }}</p>
          <h2>{{ t('content.docs.t017') }}</h2>
          <p>
            {{ t('content.docs.t018') }}<a :href="href('create.html')">{{ t('content.docs.t019') }}</a
            >{{ t('content.docs.t020') }}<a :href="href('works.html')">{{ t('content.docs.t021') }}</a
            >{{ t('content.docs.t022') }}<a :href="href('account.html')">{{ t('content.docs.t023') }}</a
            >{{ t('content.docs.t024') }}
          </p>
          <ul>
            <li>{{ t('content.docs.t025') }}</li>
            <li>{{ t('content.docs.t026') }}</li>
            <li>{{ t('content.docs.t027') }}</li>
          </ul>
          <div class="actions">
            <a class="button primary" :href="href('create.html')">{{ t('content.docs.t028') }}</a><a
              class="button secondary"
              :href="href('login.html')"
              >{{ t('content.docs.t029') }}</a
            >
          </div>
        </section>
        <section id="website-create">
          <h2>{{ t('content.docs.t030') }}</h2>
          <ol class="steps">
            <li>{{ t('content.docs.t031') }}</li>
            <li>{{ t('content.docs.t032') }}</li>
            <li>{{ t('content.docs.t033') }}</li>
            <li>{{ t('content.docs.t034') }}</li>
          </ol>
          <p>{{ t('content.docs.t035') }}</p>
          <div class="notice">
            <h3>{{ t('content.docs.t036') }}</h3>
            <p>{{ t('content.docs.t037') }}</p>
          </div>
        </section>
        <section id="website-works">
          <h2>{{ t('content.docs.t038') }}</h2>
          <p>{{ t('content.docs.t039') }}</p>
          <ul>
            <li>{{ t('content.docs.t040') }}</li>
            <li>{{ t('content.docs.t041') }}</li>
            <li>{{ t('content.docs.t042') }}</li>
          </ul>
          <a class="text-link" :href="href('works.html')"
            >{{ t('content.docs.t043') }}<span aria-hidden="true">→</span></a
          >
        </section>
        <section id="website-account">
          <h2>{{ t('content.docs.t044') }}</h2>
          <p>{{ t('content.docs.t045') }}</p>
          <ul>
            <li>{{ t('content.docs.t046') }}</li>
            <li>{{ t('content.docs.t047') }}</li>
            <li>{{ t('content.docs.t048') }}</li>
          </ul>
          <a class="text-link" :href="href('account.html')"
            >{{ t('content.docs.t049') }}<span aria-hidden="true">→</span></a
          >
        </section>
        <section id="website-share">
          <h2>{{ t('content.docs.t050') }}</h2>
          <p>{{ t('content.docs.t051') }}</p>
        </section>
        <section id="app">
          <p class="eyebrow">{{ t('content.docs.t052') }}</p>
          <h2>{{ t('content.docs.t053') }}</h2>
          <p>{{ t('content.docs.t054') }}</p>
          <div class="actions">
            <a class="button primary" :href="href('downloads.html')">{{ t('content.docs.t055') }}</a>
          </div>
        </section>
        <section id="install">
          <h2>{{ t('content.docs.t056') }}</h2>
          <p>{{ t('content.docs.t057') }}</p>
          <p>{{ t('content.docs.t058') }}</p>
          <div class="actions">
            <a class="button secondary" :href="href('downloads.html#platform-android')">{{
              t('content.docs.t059')
            }}</a>
          </div>
        </section>
        <section id="config">
          <h2>{{ t('content.docs.t060') }}</h2>
          <p>{{ t('content.docs.t061') }}</p>
          <div class="option-grid">
            <article class="info-card">
              <h3>{{ t('content.docs.t062') }}</h3>
              <p>{{ t('content.docs.t063') }}</p>
            </article>
            <article class="info-card">
              <h3>{{ t('content.docs.t064') }}</h3>
              <p>{{ t('content.docs.t065') }}</p>
            </article>
          </div>
          <div class="notice">
            <h3>{{ t('content.docs.t066') }}</h3>
            <p>{{ t('content.docs.t067') }}</p>
          </div>
          <a class="text-link" :href="href('pricing.html#cloud')"
            >{{ t('content.docs.t068') }}<span aria-hidden="true">→</span></a
          >
        </section>
        <section id="app-create">
          <h2>{{ t('content.docs.t069') }}</h2>
          <p>{{ t('content.docs.t070') }}</p>
          <ul>
            <li>
              <strong>{{ t('content.docs.t071') }}</strong>{{ t('content.docs.t072') }}
            </li>
            <li>
              <strong>{{ t('content.docs.t073') }}</strong>{{ t('content.docs.t074') }}
            </li>
            <li>
              <strong>{{ t('content.docs.t075') }}</strong>{{ t('content.docs.t076') }}
            </li>
          </ul>
          <p>{{ t('content.docs.t077') }}</p>
        </section>
        <section id="app-save">
          <h2>{{ t('content.docs.t078') }}</h2>
          <p>{{ t('content.docs.t079') }}</p>
          <div class="option-grid">
            <article class="info-card">
              <h3>{{ t('content.docs.t080') }}</h3>
              <p>{{ t('content.docs.t081') }}</p>
            </article>
            <article class="info-card">
              <h3>{{ t('content.docs.t082') }}</h3>
              <p>{{ t('content.docs.t083') }}</p>
            </article>
          </div>
          <p>{{ t('content.docs.t084') }}</p>
        </section>
        <section id="app-history">
          <h2>{{ t('content.docs.t085') }}</h2>
          <ul>
            <li>
              <strong>{{ t('content.docs.t086') }}</strong>{{ t('content.docs.t087') }}
            </li>
            <li>
              <strong>{{ t('content.docs.t088') }}</strong>{{ t('content.docs.t089') }}
            </li>
            <li>
              <strong>{{ t('content.docs.t090') }}</strong>{{ t('content.docs.t091') }}
            </li>
            <li>
              <strong>{{ t('content.docs.t092') }}</strong>{{ t('content.docs.t093') }}
            </li>
          </ul>
          <p>{{ t('content.docs.t094') }}</p>
        </section>
        <section id="language">
          <h2>{{ t('content.docs.t095') }}</h2>
          <p>{{ t('content.docs.t096') }}</p>
          <p>{{ t('content.docs.t097') }}</p>
        </section>
        <section id="privacy">
          <h2>{{ t('content.docs.t098') }}</h2>
          <p>{{ t('content.docs.t099') }}</p>
          <dl class="definition-list">
            <div>
              <dt>{{ t('content.docs.t100') }}</dt>
              <dd>{{ t('content.docs.t101') }}</dd>
            </div>
            <div>
              <dt>{{ t('content.docs.t102') }}</dt>
              <dd>{{ t('content.docs.t103') }}</dd>
            </div>
            <div>
              <dt>{{ t('content.docs.t104') }}</dt>
              <dd>{{ t('content.docs.t105') }}</dd>
            </div>
            <div>
              <dt>{{ t('content.docs.t106') }}</dt>
              <dd>{{ t('content.docs.t107') }}</dd>
            </div>
            <div>
              <dt>{{ t('content.docs.t108') }}</dt>
              <dd>{{ t('content.docs.t109') }}</dd>
            </div>
          </dl>
          <a class="text-link" :href="href('downloads.html#updates')"
            >{{ t('content.docs.t110') }}<span aria-hidden="true">→</span></a
          >
        </section>
      </div>
    </div>
  </main>
</template>
