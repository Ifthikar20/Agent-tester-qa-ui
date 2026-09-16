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

// Each pair clears 4.5:1, text on tint.
const TONES = [
  'bg-sky-100 text-sky-800',
  'bg-amber-100 text-amber-800',
  'bg-emerald-100 text-emerald-800',
  'bg-violet-100 text-violet-800',
  'bg-rose-100 text-rose-800',
  'bg-teal-100 text-teal-800',
  'bg-indigo-100 text-indigo-800',
  'bg-orange-100 text-orange-800',
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
