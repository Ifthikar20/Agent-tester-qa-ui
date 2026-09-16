<script setup>
/**
 * The driven browser's address bar — and the one place you point it somewhere.
 *
 * The canvas is a video, so it has no chrome: no address bar, no lock, no
 * status. You can watch a page navigate somewhere else and have no way to learn
 * where. That is worse than it sounds, because the interesting navigations are
 * the ones you did not ask for — a login that bounces you to an identity
 * provider on another domain, a marketing link that detours through a tracker,
 * a 301 to a path that no longer exists behind a friendly 404 page.
 *
 * So this is the chrome. It answers, in the order a person asks:
 *
 *   which application am I on   the address, with a padlock for https
 *   how did I get here          the redirect chain, if there was one
 *   should I be worried         whether it left the origin, and any 4xx/5xx
 *
 * And it is where you go somewhere else. The console used to show the address
 * up here and take a new one in a second box under the canvas, with Open,
 * Re-scan and Record beside it: two boxes for one idea, and the actions as far
 * from the page as the layout allowed. This is the toolbar every browser has
 * already taught — the address you are on, which you can overwrite and open,
 * with the actions that belong to the page beside it (the actions slot).
 *
 * The draft follows the page. When the page navigates, the box shows the new
 * address — unless you are typing in it, in which case what you typed stays.
 * Escape puts the page's address back.
 */
import { computed, ref, watch } from 'vue';
import Btn from '@/components/Btn.vue';

const props = defineProps({
  /** The address right now, or null when nothing is open. */
  url: { type: String, default: null },
  /** The navigation that produced it, if we have one: hops, status, leftOrigin. */
  nav: { type: Object, default: null },
  /** The draft: what the box shows, and what Open opens. */
  modelValue: { type: String, default: '' },
  /** An open in flight. */
  busy: Boolean,
});
const emit = defineEmits(['update:modelValue', 'open']);

const unfolded = ref(false);
const focused = ref(false);

const blank = (u) => !u || u === 'about:blank';

// Follow the page, but never over someone's typing.
watch(() => props.url, (u) => {
  if (!blank(u) && !focused.value && u !== props.modelValue) emit('update:modelValue', u);
}, { immediate: true });

/** What the padlock says about the page that is open. Never throws. */
const secure = computed(() => {
  if (blank(props.url)) return null;
  try { return new URL(props.url).protocol === 'https:'; } catch { return false; }
});

const hops = computed(() => props.nav?.hops ?? []);
const redirects = computed(() => props.nav?.redirects ?? 0);
const status = computed(() => props.nav?.status ?? null);
const leftOrigin = computed(() => !!props.nav?.leftOrigin);

/** Where it started, for the "left" chip — the useful half of a long chain. */
const cameFrom = computed(() => {
  const first = hops.value[0]?.url;
  if (!first) return null;
  try { return new URL(first).host; } catch { return first; }
});

const short = (u) => {
  try { const p = new URL(u); return `${p.host}${p.pathname}${p.search}`; } catch { return u; }
};

function submit() {
  if (props.modelValue.trim()) emit('open');
}
</script>

<template>
  <div class="rounded-t-xl border border-b-0 border-hairline bg-ground px-3 py-2">
    <div class="flex items-center gap-2">
      <!-- The address field. Scheme as a shape rather than a word: a padlock is
           the one piece of browser iconography everyone already reads. -->
      <label class="flex min-w-0 grow items-center gap-2 rounded-full border border-hairline bg-panel px-3 py-1.5
                    focus-within:border-ink/25">
        <svg class="size-3.5 shrink-0" :class="secure ? 'text-good' : 'text-ink-3'"
             viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"
             :aria-label="secure === null ? 'nothing open' : secure ? 'https' : 'http'" role="img">
          <template v-if="secure">
            <rect x="3.5" y="7" width="9" height="6" rx="1.5" />
            <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
          </template>
          <template v-else>
            <circle cx="8" cy="8" r="5.5" />
            <path d="M2.5 8h11M8 2.5c1.6 1.7 1.6 9.3 0 11M8 2.5c-1.6 1.7-1.6 9.3 0 11" />
          </template>
        </svg>
        <input :value="modelValue" spellcheck="false" autocomplete="off" aria-label="Address"
               placeholder="staging.acme.com/dashboard — type an address and press Enter"
               class="min-w-0 grow bg-transparent font-mono text-[12.5px] text-ink outline-none placeholder:text-ink-3"
               :title="url ?? undefined"
               @input="emit('update:modelValue', $event.target.value)"
               @focus="focused = true" @blur="focused = false"
               @keyup.enter="submit" @keydown.esc="emit('update:modelValue', blank(url) ? '' : url)">
      </label>

      <!-- The chip that matters. A redirect onto another host is how a run ends
           up somewhere nobody allowed, so it is named rather than counted. -->
      <button v-if="leftOrigin" class="chip shrink-0 border-warn/40 bg-warn/10 text-warn"
              :title="`Started on ${cameFrom} and ended up somewhere else`"
              @click="unfolded = !unfolded">
        left {{ cameFrom }}
      </button>
      <button v-else-if="redirects" class="chip shrink-0" @click="unfolded = !unfolded">
        {{ redirects }} redirect{{ redirects === 1 ? '' : 's' }}
      </button>

      <span v-if="status && status >= 400" class="chip shrink-0 border-critical/40 bg-critical/10 text-critical">
        {{ status }}
      </span>

      <Btn size="sm" :busy="busy" busy-label="Opening…" @click="submit">Open</Btn>
      <slot name="actions" />
    </div>

    <!-- The chain, hop by hop, with the status each one answered. "It works"
         and "it works after three 301s" are different facts. -->
    <ol v-if="unfolded && hops.length > 1" class="mt-2 space-y-1 border-t border-hairline pt-2">
      <li v-for="(h, i) in hops" :key="i" class="flex items-baseline gap-2 font-mono text-[11.5px]">
        <span class="w-8 shrink-0 text-right"
              :class="h.status >= 400 ? 'text-critical' : h.status >= 300 ? 'text-ink-3' : 'text-good'">
          {{ h.status ?? '—' }}
        </span>
        <span class="min-w-0 truncate" :class="i === hops.length - 1 ? 'text-ink' : 'text-ink-3'"
              :title="h.url">{{ short(h.url) }}</span>
      </li>
    </ol>
  </div>
</template>
