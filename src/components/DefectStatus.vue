<script setup>
/**
 * A defect's status, filled — the colour a tracker's status column is read by
 * at a glance — and never the colour alone: the glyph and the word sit inside
 * the fill, so Reopened and Closed differ in shape and name as well as in red
 * and green. Every fill clears 4.5:1 under its white text (app.css).
 *
 * `cell` fills the table cell it sits in, edge to edge; otherwise it is a pill.
 */
import { computed } from 'vue';
import { STATUSES } from '@/defects';

const props = defineProps({
  status: { type: String, required: true },
  cell: { type: Boolean, default: false },
  size: { type: String, default: 'md' },   // 'sm' for a pill in dense places
});

const LOOK = {
  open:        { fill: 'bg-status-open',     d: 'M8 4.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z' },
  reopened:    { fill: 'bg-status-reopened', d: 'M12.3 6.3A4.6 4.6 0 1 0 12.6 9.2M12.7 3.3v3.1H9.6' },
  known_issue: { fill: 'bg-status-known',    d: 'M4.5 13.5V2.8M4.5 3.2h7.3L10.1 6l1.7 2.8H4.5' },
  wont_fix:    { fill: 'bg-status-wontfix',  d: 'M8 3.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2zM4.8 11.2l6.4-6.4' },
  closed:      { fill: 'bg-status-closed',   d: 'M3 8.5l3.2 3.2L13 5' },
};
const look = computed(() => LOOK[props.status] ?? LOOK.open);
const shape = computed(() => {
  if (props.cell) return 'flex h-full min-h-14 w-full justify-center px-2 text-[12.5px]';
  return props.size === 'sm' ? 'inline-flex rounded-full px-2 py-0.5 text-[11.5px]' : 'inline-flex rounded-full px-2.5 py-1 text-[12.5px]';
});
</script>

<template>
  <span class="items-center gap-1.5 font-medium text-white" :class="[shape, look.fill]" :title="STATUSES[status]?.means">
    <svg viewBox="0 0 16 16" class="size-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path :d="look.d" />
    </svg>
    {{ STATUSES[status]?.label ?? status }}
  </span>
</template>
