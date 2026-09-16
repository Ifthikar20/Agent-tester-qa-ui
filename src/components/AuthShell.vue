<script setup>
/**
 * The frame every account page shares: sign in, sign up, the code, the
 * reset, the changes. Deliberately outside the app shell — no sidebar, no
 * suites, no console — because every one of those needs the runner, and a
 * runner that refuses. Chrome around a page that cannot load anything is
 * how a login screen ends up looking like a broken dashboard.
 *
 * Two halves. On the left, the painting from the landing page, full-bleed,
 * with the product's promise on it and the four things it does along the
 * foot; on the right, the page itself — a title, the form, a line under it.
 * The panel is the same on every account page, so going from sign in to
 * sign up to the code changes the right half and nothing else. Under 1024px
 * the panel goes, and a phone gets the form it came for.
 *
 * The painting is shown the way the landing does not show it: bare, and
 * pushed through the brand's warm run — a gradient under it, the picture
 * multiplied over — so the linen reads as marbled colour and white type
 * reads on it. A photograph of the real canvas gets the same treatment,
 * which is the point of a treatment: the panel looks intended whatever the
 * picture turns out to be.
 */
import { painting } from '@/assets/landing/painting';

defineProps({ title: { type: String, required: true }, blurb: { type: String, default: '' }, wide: Boolean });

/** Along the foot of the panel: what the product does, in four. */
const points = [
  { label: 'Watch every step', icon: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'] },
  { label: 'No selectors', icon: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'] },
  { label: 'Record behind SSO', icon: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'] },
  { label: 'Defects close themselves', icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M12 8v4', 'M12 16h.01'] },
];
</script>

<template>
  <div class="auth">
    <aside class="panel">
      <img class="panel-picture" :src="painting" alt="" decoding="async" fetchpriority="high" />
      <i class="panel-veil" aria-hidden="true" />

      <div class="panel-copy">
        <h2 class="panel-h"><b>Browser</b><br />testing you<br /><b>can watch.</b></h2>
        <p class="panel-p">
          ghostclick drives a real Chromium through your app one visible step at a time and
          streams it to you — recorded from a click, replayed anywhere, read by a person.
        </p>
        <span class="panel-pill">Preview</span>
      </div>

      <div class="panel-foot">
        <ul class="panel-points">
          <li v-for="p in points" :key="p.label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path v-for="(d, i) in p.icon" :key="i" :d="d" />
            </svg>
            {{ p.label }}
          </li>
        </ul>
        <RouterLink :to="{ name: 'landing' }" class="panel-brand">
          <span class="panel-mark" aria-hidden="true"><i /></span>
          <!-- One span, or the flex gap falls between "ghost" and "click". -->
          <span>ghost<b>click</b></span>
        </RouterLink>
      </div>
    </aside>

    <main class="page">
      <div class="page-inner w-full" :class="wide ? 'max-w-md' : 'max-w-sm'">
        <h1 class="display text-[34px]">{{ title }}</h1>
        <p v-if="blurb" class="mt-2 text-[14px] leading-relaxed text-ink-3">{{ blurb }}</p>
        <slot />
        <p v-if="$slots.foot" class="mt-5 text-[12.5px] leading-relaxed text-ink-3"><slot name="foot" /></p>
      </div>
      <p class="page-copy text-[11.5px] text-ink-3">
        © 2026 ghostclick · <RouterLink :to="{ name: 'landing' }" class="hover:text-ink">Home</RouterLink> · In preview, by invitation
      </p>
    </main>
  </div>
</template>

<style scoped>
.auth {
  display: grid;
  grid-template-columns: minmax(0, 11fr) minmax(0, 9fr);
  min-height: 100dvh;
}

/* ── The panel ── */
.panel {
  --pad: clamp(28px, 4vw, 56px);
  position: sticky;
  top: 16px;
  height: calc(100dvh - 32px);
  margin: 16px 0 16px 16px;
  padding: var(--pad);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 40px;
  overflow: hidden;
  isolation: isolate;
  border-radius: 28px;
  color: #fff;
  /* The brand's warm run: magenta into orange into amber. */
  background: linear-gradient(160deg, #e6007c 0%, #ff5a3c 48%, #ffb020 100%);
}
.panel-picture {
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  mix-blend-mode: multiply;
  opacity: .92;
  filter: saturate(1.25) contrast(1.05);
}
/* Darker at the head and the foot, where the words are. */
.panel-veil {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(to bottom, rgba(0, 0, 0, .3) 0%, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0) 62%, rgba(0, 0, 0, .5) 100%);
}

.panel-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 22px; max-width: 30rem; }
.panel-h {
  margin: 0;
  font-size: clamp(38px, 4.4vw, 64px);
  line-height: 1.02;
  letter-spacing: -.02em;
  font-weight: 400;
  text-transform: uppercase;
}
.panel-h b { font-weight: 800; }
.panel-p { margin: 0; max-width: 34rem; font-size: 15px; line-height: 1.55; color: rgba(255, 255, 255, .88); }
.panel-pill {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .18);
  border: 1px solid rgba(255, 255, 255, .28);
  backdrop-filter: blur(6px);
  font-size: 12.5px;
  font-weight: 600;
}

.panel-foot { display: flex; flex-direction: column; gap: 22px; }
.panel-points { display: flex; flex-wrap: wrap; gap: 12px 26px; margin: 0; padding: 0; list-style: none; }
.panel-points li { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; white-space: nowrap; }
.panel-brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  align-self: flex-start;
  font-size: 19px;
  font-weight: 500;
  letter-spacing: -.02em;
  color: #fff;
  text-decoration: none;
}
.panel-brand b { font-weight: 700; }
.panel-mark {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: #fff;
}
.panel-mark i { display: block; width: 7px; height: 7px; border-radius: 50%; background: #e6007c; }

/* ── The page ── */
.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 24px 20px;
}
.page-inner { margin: auto; }
.page-copy { padding-top: 32px; text-align: center; }

/* The account pages get roomier fields than a settings form: this is the
   whole page, and the one thing on it. Outranks Field.vue's slotted rule. */
.page :deep(input:not([type="checkbox"]):not([type="radio"])) {
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 14px;
}

@media (max-width: 1023px) {
  .auth { grid-template-columns: 1fr; }
  .panel { display: none; }
  .page { padding-top: 48px; }
}
</style>
