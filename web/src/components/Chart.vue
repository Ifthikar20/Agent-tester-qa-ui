<script setup>
/**
 * One chart, from a spec (charts.js): a canvas the size of its box, redrawn
 * when the theme flips or the spec changes, and — because a picture is the
 * one thing a screen reader cannot read and a tooltip the one thing a finger
 * cannot hover — the same numbers as a table, a press away. The title is the
 * caller's to draw or not: under a chat reply the card names it, on a page
 * the section heading does.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Chart, build, paint, shortLabel } from '@/charts';

const props = defineProps({
  /** { type, title, subtitle?, labels, series: [{ name, values, role?, roles? }], stacked?, horizontal?, unit?, x?, note? } */
  spec: { type: Object, required: true },
  /** The plot's height in pixels; the axis band is inside it, so nothing scrolls. */
  height: { type: Number, default: 220 },
  /** The legend under the plot — off where the page draws its own beside the heading. */
  legend: { type: Boolean, default: true },
});
const canvas = ref(null);
const values = ref(false);
let chart = null;
let themeWatch = null;

function draw() {
  if (!canvas.value) return;
  chart?.destroy();
  chart = new Chart(canvas.value, build(props.spec, paint(), { legend: props.legend }));
}
onMounted(() => {
  draw();
  // The theme is a data attribute on <html> (App.vue paintTheme): when it changes, the tokens have.
  themeWatch = new MutationObserver(() => nextTick(draw));
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
});
watch(() => props.spec, () => nextTick(draw), { deep: true });
onBeforeUnmount(() => { chart?.destroy(); chart = null; themeWatch?.disconnect(); });

const fmt = (v) => (v == null ? '' : `${Number(v).toLocaleString()}${props.spec.unit === '%' ? '%' : props.spec.unit ? ` ${props.spec.unit}` : ''}`);
const label = (l) => shortLabel(l, props.spec.x);
const described = () => `${props.spec.title ?? 'Chart'}: ${(props.spec.series ?? []).map((s) => `${s.name} ${s.values.reduce((a, b) => a + (Number(b) || 0), 0)} in all`).join(', ')}`;
</script>

<template>
  <div data-chart>
    <div class="relative" :style="{ height: `${height}px` }">
      <canvas ref="canvas" role="img" :aria-label="described()" />
    </div>
    <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11.5px] text-ink-3">
      <span v-if="spec.note">{{ spec.note }}</span>
      <button type="button" class="text-brand-2 underline underline-offset-2" @click="values = !values">{{ values ? 'Hide the values' : 'Show the values' }}</button>
    </div>
    <div v-if="values" class="mt-2 overflow-x-auto">
      <table class="w-full text-left text-[12px]">
        <thead class="table-head"><tr><th class="px-2 py-1 font-medium">{{ spec.x === 'date' ? 'Day' : '' }}</th><th v-for="s in spec.series" :key="s.name" class="px-2 py-1 font-medium">{{ s.name }}</th></tr></thead>
        <tbody>
          <tr v-for="(l, i) in spec.labels" :key="i" class="border-t border-hairline">
            <td class="whitespace-nowrap px-2 py-1 text-ink-2">{{ label(l) }}</td>
            <td v-for="s in spec.series" :key="s.name" class="px-2 py-1 tabular-nums text-ink">{{ fmt(s.values[i]) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
