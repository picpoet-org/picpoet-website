<script setup>
import { useSite } from '../i18n/context.mjs';
const { t, href } = useSite();
</script>
<template>
  <main id="main" tabindex="-1">
    <section class="hero shell" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">{{ t('content.index.t001') }}</p>
        <h1 id="hero-title">
          {{ t('content.index.t002') }}<br /><span>{{ t('content.index.t003') }}</span>
        </h1>
        <p class="lede">{{ t('content.index.t004') }}</p>
        <div class="actions">
          <a class="button primary" :href="href('downloads.html')"
            >{{ t('content.index.t005') }}<span aria-hidden="true">→</span></a
          >
          <a class="button secondary" :href="href('create.html')">{{ t('content.index.t006') }}</a>
        </div>
        <p class="hero-note">{{ t('content.index.t007') }}</p>
      </div>
      <figure class="hero-card">
        <div class="artwork-heading">
          <span>{{ t('content.index.t008') }}</span><span class="artwork-stamp">{{
            t('content.index.t009')
          }}</span>
        </div>
        <svg
          class="landscape"
          viewBox="0 0 640 400"
          role="img"
          aria-labelledby="landscape-title landscape-desc"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title id="landscape-title">{{ t('content.index.t010') }}</title>
          <desc id="landscape-desc">{{ t('content.index.t011') }}</desc>
          <rect width="640" height="400" fill="var(--pp-color-photo)" />
          <circle cx="466" cy="98" r="35" fill="var(--pp-color-accent-dark)" opacity=".8" />
          <path
            d="M0 221 88 135 151 194 262 80 365 201 459 155 640 228V400H0Z"
            fill="var(--pp-color-muted-light)"
            opacity=".5"
          />
          <path
            d="M0 249 129 210 211 251 366 142 502 251 640 193V400H0Z"
            fill="var(--pp-color-muted)"
            opacity=".5"
          />
          <path d="M0 278Q165 246 310 279T640 275V400H0Z" fill="var(--pp-color-paper)" opacity=".8" />
          <g fill="none" stroke="var(--pp-color-muted-light)" stroke-linecap="round">
            <path d="M70 313h145m178 15h137M156 357h180m83 16h85" />
            <path d="M429 284h57m-47 9h34" stroke="var(--pp-color-accent-dark)" opacity=".65" />
          </g>
          <!-- 小舟以弧形船舷、斗笠与船桨呼应“一棹入秋光”。 -->
          <g class="landscape-boat" stroke-linecap="round" stroke-linejoin="round">
            <g fill="none" stroke="var(--pp-color-muted-light)" opacity=".48">
              <path d="M263 338q40 5 80-1m-65 7q24 3 48 0" />
              <path d="M340 348q13 3 26 0m-19 5h13" />
            </g>
            <path d="M263 317q43 13 87-3-10 16-28 18h-36q-15-3-23-15Z" fill="var(--pp-color-ink)" />
            <path d="M271 320q34 8 69-1" fill="none" stroke="var(--pp-color-panel)" stroke-width="1.5" />
            <path d="M286 324h29" fill="none" stroke="var(--pp-color-muted-light)" stroke-width="1.5" />
            <path d="M296 301q-6 6-6 16l-8 6h22l-7-7 5-10Z" fill="var(--pp-color-ink)" />
            <circle cx="299" cy="297" r="4" fill="var(--pp-color-ink)" />
            <path
              d="m287 294 11-8 12 8q-11 4-23 0Z"
              fill="var(--pp-color-muted)"
              stroke="var(--pp-color-ink)"
              stroke-width="1.5"
            />
            <path d="m296 306 12 8 9-2" fill="none" stroke="var(--pp-color-ink)" stroke-width="3" />
            <path d="m309 306 37 34" fill="none" stroke="var(--pp-color-ink)" stroke-width="2" />
            <path d="m342 334 14 10q3 3 0 5-2 2-5-1l-12-12Z" fill="var(--pp-color-ink)" />
          </g>
        </svg>
        <div class="poem-preview">
          <h2>{{ t('content.index.t012') }}</h2>
          <p>{{ t('content.index.t013') }}<br />{{ t('content.index.t014') }}</p>
          <div class="tag-list" :aria-label="t('content.index.t038')">
            <span>{{ t('content.index.t015') }}</span><span>{{ t('content.index.t016') }}</span
            ><span>{{ t('content.index.t017') }}</span>
          </div>
        </div>
      </figure>
    </section>

    <section class="section shell" aria-labelledby="features-title">
      <div class="section-heading">
        <p class="eyebrow">{{ t('content.index.t018') }}</p>
        <h2 id="features-title">{{ t('content.index.t019') }}</h2>
        <p>{{ t('content.index.t020') }}</p>
      </div>
      <div class="feature-grid">
        <article>
          <span class="feature-number" aria-hidden="true">01</span>
          <h3>{{ t('content.index.t021') }}</h3>
          <p>{{ t('content.index.t022') }}</p>
        </article>
        <article>
          <span class="feature-number" aria-hidden="true">02</span>
          <h3>{{ t('content.index.t023') }}</h3>
          <p>{{ t('content.index.t024') }}</p>
        </article>
        <article>
          <span class="feature-number" aria-hidden="true">03</span>
          <h3>{{ t('content.index.t025') }}</h3>
          <p>{{ t('content.index.t026') }}</p>
        </article>
      </div>
    </section>

    <section class="section shell split-section" aria-labelledby="preferences-title">
      <div>
        <p class="eyebrow">{{ t('content.index.t027') }}</p>
        <h2 id="preferences-title">{{ t('content.index.t028') }}<br />{{ t('content.index.t029') }}</h2>
      </div>
      <div class="section-copy">
        <p>{{ t('content.index.t030') }}</p>
        <p>{{ t('content.index.t031') }}</p>
      </div>
    </section>
    <section class="closing shell" aria-labelledby="closing-title">
      <p class="eyebrow">{{ t('content.index.t032') }}</p>
      <h2 id="closing-title">{{ t('content.index.t033') }}<br />{{ t('content.index.t034') }}</h2>
      <p>{{ t('content.index.t035') }}</p>
      <div class="actions">
        <a class="button primary" :href="href('downloads.html')">{{ t('content.index.t036') }}</a><a
          class="text-link"
          :href="href('docs.html')"
          >{{ t('content.index.t037') }}<span aria-hidden="true">→</span></a
        >
      </div>
    </section>
  </main>
</template>
