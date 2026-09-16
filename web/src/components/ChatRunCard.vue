<script setup>
/**
 * One run, as a card under the reply that made it.
 *
 * Two sources, one look. A `run` is the record the runner kept on the message
 * (chat.js runsOf): the verdict, the step it stopped on, the defect it was
 * filed under. `live` is stores/live.js's run in progress, bound while a run
 * tool is in flight — so a reply whose answer is a run shows the steps landing
 * one by one rather than a spinner for as long as the case takes, and then
 * the kept record takes over word for word.
 *
 * The step sentence is the console's: written back by the vocabulary, else
 * drawn as the diagram would draw it. One reading of a step, not a fourth.
 */
import { computed } from 'vue';
import { labelAction, showAction } from '@lang';
import StatusPill from '@/components/StatusPill.vue';

const props = defineProps({
  /** A kept run: { suiteId, suite, caseId, caseName, ok, passed, total, step, error, target, defect, at, oneOff? } */
  run: { type: Object, default: null },
  /** live.run: { suite, caseName, total, steps: [{ i, state, ms, error, step }] } */
  live: { type: Object, default: null },
});

const cap = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));
function describe(s) {
  try { return showAction(s) ?? labelAction(s, (t, n) => cap(t, Math.max(n, 40))); }
  catch { return `${s.op} ${s.target ?? s.value ?? s.url ?? ''}`.trim(); }
}

const steps = computed(() => props.live?.steps ?? []);
const current = computed(() => steps.value.find((s) => s.state === 'run') ?? null);
const failed = computed(() => steps.value.find((s) => s.state === 'fail') ?? null);

const title = computed(() => {
  const r = props.live ?? props.run ?? {};
  const suite = String(r.suite ?? '');
  const name = String(r.caseName ?? '');
  // A live run's `suite` is the plan's own label, which for a case already
  // reads "suite · case" — so the case is added only when it is not there.
  if (name && !suite.includes(name)) return [suite, name].filter(Boolean).join(' · ');
  return suite || name || 'Run';
});
const passed = computed(() => (props.live ? steps.value.filter((s) => s.state === 'pass').length : props.run?.passed ?? 0));
const total = computed(() => (props.live ? props.live.total ?? steps.value.length : props.run?.total ?? 0));
/** null while it runs — the pill's grey "Running" — and the verdict after. */
const ok = computed(() => (props.live ? (failed.value ? false : null) : !!props.run?.ok));

/** Where it stopped, and on what: the failing step live, the kept record after. */
const stopped = computed(() => {
  if (props.live) {
    const f = failed.value;
    if (!f) return null;
    const s = f.step ?? {};
    return { target: s.target ?? s.url ?? s.value ?? `step ${f.i}`, error: f.error ?? 'failed' };
  }
  const r = props.run;
  if (!r || r.ok || !(r.error || r.target)) return null;
  return { target: r.target ?? (r.step != null ? `step ${r.step}` : 'a step'), error: r.error ?? 'failed' };
});
</script>

<template>
  <div class="rounded-xl border border-hairline bg-ground px-3.5 py-3 text-[12.5px]">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusPill :ok="ok" :label="ok === null ? 'Running' : null" size="sm" />
      <span class="min-w-0 truncate font-medium text-ink" :title="title">{{ title }}</span>
      <span v-if="run?.oneOff" class="text-ink-3">(one-off check)</span>
      <span class="ml-auto shrink-0 tabular-nums text-ink-3">passed {{ passed }}/{{ total }} steps</span>
    </div>
    <!-- The step under way, in the console's words, while there is one. -->
    <p v-if="live && current" class="mt-1.5 flex items-center gap-1.5 font-mono text-[11.5px] text-ink-2">
      <span class="size-1.5 shrink-0 animate-pulse rounded-full bg-brand" aria-hidden="true" />
      <span class="min-w-0 truncate">{{ describe(current.step) }}</span>
    </p>
    <p v-if="stopped" class="mt-1.5 font-mono text-[11.5px] leading-relaxed text-critical">
      stopped at {{ stopped.target }}: {{ stopped.error }}
    </p>
    <!-- The defects page has no page per defect yet, so the number links to
         the list it is on rather than to a route that would fall through. -->
    <RouterLink v-if="run?.defect" to="/defects"
                class="mt-1.5 inline-block text-[12px] text-brand-2 underline underline-offset-2"
                :title="`Filed as ${run.defect} — open the defects page`">{{ run.defect }}</RouterLink>
  </div>
</template>
