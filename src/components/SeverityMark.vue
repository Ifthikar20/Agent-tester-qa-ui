<script setup>
/**
 * Severity as a tinted chip: bars to run an eye down the column, a tint that
 * gets louder with the severity, and the word, so it is never the colour
 * alone. Each text-on-tint pair clears 4.5:1. `auto` marks the runner's own
 * judgement, which an owner or admin can overrule, so a reader knows whose it is.
 */
import { SEVERITIES } from '@/defects';

defineProps({
  severity: { type: String, required: true },
  auto: { type: Boolean, default: false },
});

const BARS = { critical: 4, major: 3, minor: 2, trivial: 1 };
const TONE = {
  critical: 'bg-red-50 text-red-700 ring-red-200',
  major:    'bg-amber-50 text-amber-800 ring-amber-200',
  minor:    'bg-slate-100 text-slate-700 ring-slate-200',
  trivial:  'bg-ink/[0.04] text-ink-2 ring-hairline',
};
</script>

<template>
  <span class="inline-flex items-center gap-1.5 whitespace-nowrap"
        :title="auto ? 'Worked out by ghostclick — an owner or admin can overrule it' : 'Set by a person'">
    <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset"
          :class="TONE[severity] ?? TONE.trivial">
      <svg viewBox="0 0 16 16" class="size-3.5 shrink-0" aria-hidden="true">
        <rect v-for="i in 4" :key="i" :x="1 + (i - 1) * 3.75" :y="12 - i * 2.5" width="2.6" :height="2 + i * 2.5" rx="0.8"
              fill="currentColor" :fill-opacity="i <= (BARS[severity] ?? 0) ? 1 : 0.22" />
      </svg>
      {{ SEVERITIES[severity] ?? severity }}
    </span>
    <span v-if="auto" class="text-[11px] text-ink-3">auto</span>
  </span>
</template>
