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

/** Where a translated check came from, in words (chat-translate.js frameworkWord). */
const FROM = { playwright: 'Playwright', cypress: 'Cypress', selenium: 'Selenium', puppeteer: 'Puppeteer', flow: 'the flow language', table: 'a table' };

const props = defineProps({
  /**
   * A kept run: { suiteId, suite, caseId, caseName, ok, passed, total, step, error, target, defect, at, oneOff? }
   * — and, for a drafted check (chat-plan.js): draft, candidate, verdict, attempts, revised, cite, hint, flow, pageId;
   * for a check translated from a file (chat-translate.js): imported, from.
   */
  run: { type: Object, default: null },
  /** live.run: { suite, caseName, total, steps: [{ i, state, ms, error, step }] } */
  live: { type: Object, default: null },
  /** A drafted check this viewer kept as a case, and one being kept now. */
  saved: Boolean,
  saving: Boolean,
});
defineEmits(['save']);

/** What a drafted check's outcome means, in a sentence a person can act on. */
const verdict = computed(() => {
  const r = props.run;
  if (!r?.verdict || r.verdict === 'passed') return null;
  const hint = r.hint ? ` — ${r.hint}` : '';
  switch (r.verdict) {
    case 'test_script': return r.ok ? { tone: 'text-ink-2', text: 'the test was wrong — fixed and re-run once, then passed' } : { tone: 'text-warn', text: `the test was wrong${hint}` };
    case 'app_bug': return { tone: 'text-critical', text: `the app is broken — every action passed and the check failed${r.cite ? ` · already ${r.cite}` : ''}` };
    case 'not_expressible': return { tone: 'text-warn', text: `cannot be tested this way${hint}` };
    case 'needs_a_person': return { tone: 'text-warn', text: `needs a person${hint}` };
    case 'refused': return { tone: 'text-warn', text: `refused${hint}` };
    case 'stopped': return { tone: 'text-ink-3', text: `not run${hint}` };
    default: return null;
  }
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
  // The kept step is an index (server.js heal.step); the reply counts from one, so the card does too.
  return { target: r.target ?? (r.step != null ? `step ${r.step + 1}` : 'a step'), error: r.error ?? 'failed' };
});
</script>

<template>
  <div class="rounded-xl border border-hairline bg-panel px-3.5 py-3 text-[12.5px]">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusPill :ok="ok" :label="ok === null ? 'Running' : null" size="sm" />
      <span class="min-w-0 truncate font-medium text-ink" :title="title">{{ title }}</span>
      <span v-if="run?.imported" class="text-ink-3">(translated from {{ FROM[run.from] ?? run.from ?? 'code' }})</span>
      <span v-else-if="run?.draft" class="text-ink-3">(drafted check{{ run.attempts > 1 ? `, ${run.attempts} attempts` : '' }})</span>
      <span v-else-if="run?.oneOff" class="text-ink-3">(one-off check)</span>
      <span class="ml-auto shrink-0 tabular-nums text-ink-3">passed {{ passed }}/{{ total }} steps</span>
    </div>
    <!-- The step under way, in the console's words, while there is one. -->
    <p v-if="live && current" class="mt-1.5 flex items-center gap-1.5 font-mono text-[11.5px] text-ink-2">
      <span class="size-1.5 shrink-0 animate-pulse rounded-full bg-brand" aria-hidden="true" />
      <span class="min-w-0 truncate">{{ describe(current.step) }}</span>
    </p>
    <p v-if="stopped" class="mt-1.5 font-mono text-[11.5px] leading-relaxed text-critical [overflow-wrap:anywhere]">
      stopped at {{ stopped.target }}: {{ stopped.error }}
    </p>
    <!-- A drafted check's verdict: the test was wrong, the app is broken, or a person is needed. -->
    <p v-if="verdict" class="mt-1.5 text-[12px] leading-relaxed" :class="verdict.tone">{{ verdict.text }}</p>
    <!-- A passing draft becomes a case only by this press (ChatView keep). -->
    <p v-if="run?.imported && run.ok && run.flow && !run.suiteId" class="mt-2 text-[12px] text-ink-3">Passed, but no suite covers its origin to keep it in — quickstart the site first.</p>
    <div v-else-if="run?.draft && run.ok && run.flow" class="mt-2">
      <span v-if="saved" class="text-[12px] text-ink-3">Saved as a case — find it under the suite's cases.</span>
      <button v-else type="button" class="rounded-full border border-hairline px-3 py-1 text-[12px] hover:border-ink/25 disabled:opacity-60"
              :disabled="saving" @click="$emit('save')">{{ saving ? 'Saving…' : 'Save as a case' }}</button>
    </div>
    <!-- The number opens the defect itself: the list with its drawer open. -->
    <RouterLink v-if="run?.defect" :to="`/defects/${run.defect}`"
                class="mt-1.5 inline-block text-[12px] text-brand-2 underline underline-offset-2"
                :title="`Filed as ${run.defect} — open it`">{{ run.defect }}</RouterLink>
  </div>
</template>
