<script setup>
/**
 * A person: an initial on a colour of their own, and their name.
 *
 * A tracker's assignee column is read by its faces. There are no photos here,
 * so each person gets a tone picked from their email — deterministic, so the
 * same person is the same colour on every row and every reload, the way
 * HeroPanel keeps a page's picture. The name is always written beside it, so
 * the colour is never how two people are told apart.
 */
import { computed } from 'vue';

const props = defineProps({
  /** {name, email}, or null for nobody. */
  person: { type: Object, default: null },
});

// Each pair clears 4.5:1, text on tint — by day and by night, because the
// tones are the case language's own colours (app.css --color-code-*), which
// are dark enough for small text on the ground in both palettes, and the tint
// is that same colour at a tenth over the panel.
const TONES = [
  'bg-code-link/10 text-code-link',
  'bg-code-value/10 text-code-value',
  'bg-code-see/10 text-code-see',
  'bg-code-fill/10 text-code-fill',
  'bg-code-click/10 text-code-click',
  'bg-code-check/10 text-code-check',
  'bg-code-open/10 text-code-open',
  'bg-code-hover/10 text-code-hover',
];
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const label = computed(() => props.person?.name || props.person?.email || '');
const tone = computed(() => TONES[hash(String(props.person?.email || label.value).toLowerCase()) % TONES.length]);
</script>

<template>
  <span v-if="person" class="inline-flex min-w-0 items-center gap-2 text-ink">
    <span class="grid size-6 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold" :class="tone"
          aria-hidden="true">{{ label.slice(0, 1).toUpperCase() }}</span>
    <span class="truncate">{{ label }}</span>
  </span>
  <span v-else class="inline-flex items-center gap-2 text-ink-3">
    <span class="size-6 shrink-0 rounded-full border border-dashed border-ink/25" aria-hidden="true" />
    Unassigned
  </span>
</template>
