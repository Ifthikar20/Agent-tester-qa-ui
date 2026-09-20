<script setup>
/**
 * One test, on its own page.
 *
 * The Tests list answers "what does this suite check"; forty cards of numbered
 * sentences answer that well and answer nothing else. The questions left over
 * are all about a single test — what exactly does it do, has it been passing,
 * where did it come from, what does its document say — and every one of them
 * costs a payload the list cannot afford forty times over. So they live here,
 * behind a test's own address, which also means a failure in a notification or
 * a chat reply can link straight at the thing that failed.
 *
 * The steps get the width and the rest goes in a column beside them, because
 * the steps are what the page is about; the history and the provenance are
 * what you check once and stop looking at.
 *
 * There is deliberately no Settings tab. A test has no per-test settings in
 * the data model — the pace, the origins and the schedule all belong to the
 * suite or to the runner — and a tab whose panel configures nothing teaches
 * people that this product's tabs are decoration. When there is something to
 * set, there will be somewhere to set it.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { kindCounts, relative } from '@/tests';
import Btn from '@/components/Btn.vue';
import StepFlow from '@/components/StepFlow.vue';

const route = useRoute();
const live = useLive();

const id = computed(() => String(route.params.id));
const testId = computed(() => String(route.params.testId));

const data = ref(null);
const loading = ref(true);
const error = ref(null);
const running = ref(false);
const tab = ref('runs');

async function load() {
  loading.value = true; error.value = null;
  try { data.value = await api.suiteTest(id.value, testId.value); }
  catch (e) { data.value = null; error.value = e.message; }
  finally { loading.value = false; }
}
/**
 * Both parameters, not just the mount.
 *
 * Vue reuses a route component when only the parameters change, so walking
 * from one test to the next never re-ran onMounted — the same mistake
 * SuiteRuns.vue has a comment about, and it shows up here as the previous
 * test's steps under the new test's name.
 */
onMounted(load);
watch([id, testId], load);

const test = computed(() => data.value?.test ?? null);
const runs = computed(() => data.value?.runs ?? []);

/**
 * A run's `at` is a number of milliseconds (runs.js stamps Date.now()) and a
 * case's createdAt and updatedAt are ISO strings (suites.js now()); `relative`
 * takes either and answers null for a date it cannot read, so this page can
 * say "not recorded" rather than "NaNd ago".
 */
const ago = (t) => relative(t);

/**
 * What the test is made of, in one line: the total first because that is the
 * number people compare tests by, then the kinds in the order a case tends to
 * run them. A kind with none of it is left out — "0 wait" is a fact nobody
 * asked for and it pushes the counts that matter off the end of the line.
 */
const KINDS = ['go', 'act', 'check', 'wait', 'goal'];
const summary = computed(() => {
  const steps = test.value?.steps ?? [];
  const counts = kindCounts(steps);
  const parts = [`${steps.length} step${steps.length === 1 ? '' : 's'}`];
  for (const k of KINDS) if (counts[k]) parts.push(`${counts[k]} ${k}`);
  return parts.join(' · ');
});

const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

/**
 * Whether to work this test out, or replay it exactly.
 *
 * Working it out is the DEFAULT, and that is the product's whole position: a
 * recorded click is a name and a point on a page that has since been
 * redesigned, and replaying it produces runs that fail with true sentences
 * about the test — "'Careers' is on the page, but the press would land outside
 * the window" — and tell you nothing about the site. Somebody pressing Run
 * wants to know whether the flow still works, and a runner that reads the page
 * and decides each move can answer that.
 *
 * Replaying exactly stays one tick away, because it is genuinely better for
 * one job: pinning down a regression, where you want the same moves every
 * time, instantly, and free.
 *
 * A test with a `goal` step in it has no choice to offer — a goal has no
 * recorded moves to replay — and the control says so rather than pretending.
 */
const replayExactly = ref(false);
const mustWorkOut = computed(() => (test.value?.steps ?? []).some((s) => s.op === 'goal'));
const agentic = computed(() => mustWorkOut.value || !replayExactly.value);

/**
 * Start from a site that has never met this browser.
 *
 * A test that signs up or signs in changes the thing it is testing, and the
 * browser remembers: the second run of a sign-up test finds a site that
 * already knows you, with no sign-up control on it anywhere, and honestly
 * reports that it cannot do what it was asked. This clears that site's cookies
 * and storage before the first step.
 *
 * Off by default and never automatic, because it signs you out of the site —
 * which is exactly wrong for the many tests that depend on a saved sign-in.
 */
const signedOut = ref(false);

/**
 * Run it from here. The overlay takes the whole screen the moment the run
 * starts, wherever it was started from, so there is nowhere to navigate to
 * first — and reloading afterwards is the point of the button: the history
 * beside the steps is the only record that this run happened.
 */
async function runOne() {
  running.value = true; error.value = null;
  try {
    // The runner works a step out unless it is told not to, so `replay` is the
    // word that has to travel and `agentic` is the absence of one.
    const r = await api.runSuite(id.value, testId.value, live.paceMs, agentic.value ? undefined : 'replay', signedOut.value);
    if (!r.outcomes?.[0]?.ok) live.say(`${test.value?.name ?? 'Test'}: ${r.outcomes?.[0]?.error ?? 'failed'}`, 'error');
  } catch (e) {
    // The origin gate is a decision, not an error: hand it to the store that
    // owns the prompt rather than printing it as a failure.
    if (e.needsOrigin) live.needsOrigin = { origin: e.needsOrigin };
    else error.value = e.message;
  } finally {
    running.value = false;
    await load();
  }
}

const TABS = [{ key: 'runs', label: 'Run history' }, { key: 'details', label: 'Details' }];
</script>

<template>
  <div>
    <p v-if="loading" class="text-[13.5px] text-ink-3">Reading the test…</p>

    <!-- The server's own sentence, not a sentence about it. It knows whether
         the suite is missing, the test is missing or the runner is down, and
         any of those paraphrased here would be a worse answer. -->
    <p v-else-if="error && !test" class="rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">
      {{ error }}
    </p>

    <template v-else-if="test">
      <p v-if="error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">
        {{ error }}
      </p>

      <header class="mb-6 flex flex-wrap items-start gap-x-4 gap-y-3">
        <div class="min-w-0 flex-1">
          <h2 class="display text-2xl">{{ test.name }}</h2>
          <p class="mt-1.5 text-[13px] text-ink-3">
            {{ summary }}<template v-if="test.source"> · {{ test.source }}</template><template v-if="ago(test.updatedAt)"> · updated {{ ago(test.updatedAt) }}</template>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <!-- The choice sits against the button it changes, because it
               changes what pressing it means: the same test, worked out or
               replayed, are two different runs and the label says which.
               Unticked is the default and is the one that thinks. -->
          <label class="flex cursor-pointer items-center gap-2 rounded-full border border-hairline px-3.5 py-1.5 text-[13px]"
                 :class="[!agentic && 'border-ink/25', mustWorkOut && 'cursor-not-allowed opacity-60']"
                 :title="mustWorkOut
                   ? 'This test has a goal in it — a step with no recorded moves — so the runner always works this one out'
                   : 'Make exactly the recorded moves, with no model in the loop: instant and free, and it fails when the page has been redesigned. Off by default — the runner reads the page and decides each move.'">
            <input type="checkbox" class="size-3.5 accent-brand" :checked="!agentic" :disabled="mustWorkOut || live.running"
                   @change="replayExactly = $event.target.checked">
            Replay exactly
          </label>
          <!-- The other thing that decides what a run means: what the browser
               already knows about the site. A sign-up test has to start from
               nothing, and by its second run it never does unless this is on. -->
          <label class="flex cursor-pointer items-center gap-2 rounded-full border border-hairline px-3.5 py-1.5 text-[13px]"
                 :class="signedOut && 'border-ink/25'"
                 title="Clear this site's cookies and storage before the first step, so the run starts as a visitor it has never seen. Off by default: it signs you out of the site, which is wrong for any test that depends on being signed in.">
            <input v-model="signedOut" type="checkbox" class="size-3.5 accent-brand" :disabled="live.running">
            Start signed out
          </label>
          <!-- Disabled while ANY run is going, not only this one: there is one
               runner and one browser behind it, so a second run started from
               here would either queue invisibly or lose to the first. -->
          <Btn :busy="running" busy-label="Running…" :disabled="live.running && !running" @click="runOne">Run</Btn>
          <RouterLink :to="{ name: 'suite-cases', params: { id } }"
                      class="rounded-full border border-hairline px-3.5 py-1.5 text-[13px] hover:border-ink/25">
            Edit as script
          </RouterLink>
        </div>
      </header>

      <div class="lg:flex lg:items-start lg:gap-6">
        <div class="min-w-0 flex-1">
          <!-- A case that no longer parses has no steps to draw, and drawing an
               empty spine under its name would say the test does nothing rather
               than that nobody can tell what it does. The script is the only
               place the problem can be fixed, so the error carries the way
               there. -->
          <section v-if="test.error" class="rounded-xl border border-critical/25 bg-critical/5 px-4 py-3">
            <p class="text-[13px] font-medium text-critical">This test no longer reads as a script</p>
            <p class="mt-1.5 whitespace-pre-wrap break-words font-mono text-[12px] text-critical">{{ test.error }}</p>
            <RouterLink :to="{ name: 'suite-cases', params: { id } }"
                        class="mt-3 inline-flex rounded-full border border-critical/40 px-3.5 py-1.5 text-[13px] text-critical hover:bg-critical/5">
              Edit as script
            </RouterLink>
          </section>

          <StepFlow v-else :steps="test.steps" :title="test.name" />
        </div>

        <aside class="card mt-6 overflow-hidden lg:mt-0 lg:w-[300px] lg:shrink-0">
          <div role="tablist" aria-label="About this test" class="flex items-center gap-1 border-b border-hairline px-3">
            <button v-for="t in TABS" :id="`test-tab-${t.key}`" :key="t.key" type="button" role="tab"
                    aria-controls="test-panel" :aria-selected="tab === t.key" :tabindex="tab === t.key ? 0 : -1"
                    class="whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[13px]"
                    :class="tab === t.key ? 'border-brand font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink'"
                    @click="tab = t.key">{{ t.label }}</button>
          </div>

          <div id="test-panel" role="tabpanel" :aria-labelledby="`test-tab-${tab}`">
            <template v-if="tab === 'runs'">
              <!-- Newest first, as the runner hands them over (runs.js forCase
                   walks its log backwards) — sorting a sorted list here would
                   be a second opinion about which run is the latest, and the
                   page's own "last run" comes from the same order. -->
              <ul v-if="runs.length" class="divide-y divide-hairline">
                <li v-for="r in runs" :key="r.at" class="flex items-baseline gap-2 px-4 py-2.5 text-[12.5px]">
                  <span class="w-3 shrink-0 text-center" :class="r.ok ? 'text-good' : 'text-critical'">
                    {{ r.ok ? '✓' : '✕' }}<span class="sr-only">{{ r.ok ? 'passed' : 'failed' }}</span>
                  </span>
                  <span class="min-w-0 flex-1 truncate text-ink-2" :title="r.error ?? undefined">{{ relative(r.at) }}</span>
                  <span class="shrink-0 tabular-nums text-ink-3">{{ r.passed }}/{{ r.total }} steps</span>
                  <span class="shrink-0 tabular-nums text-ink-3">{{ secs(r.ms) }}</span>
                </li>
              </ul>
              <p v-else class="px-4 py-6 text-[12.5px] leading-relaxed text-ink-3">
                No runs yet — run this test to see results here.
              </p>
            </template>

            <template v-else>
              <dl class="space-y-3 px-4 py-3.5 text-[12.5px]">
                <div>
                  <dt class="text-ink-3">Source</dt>
                  <dd class="mt-0.5 text-ink">{{ test.source ?? 'written' }}</dd>
                </div>
                <!-- Only when there is one: a test written by hand was never
                     recorded against anything, and "Page: none" is a blank the
                     reader has to work out is not a fault. -->
                <div v-if="test.pageId">
                  <dt class="text-ink-3">Recorded against</dt>
                  <dd class="mt-0.5 break-words font-mono text-[11.5px] text-ink">{{ test.pageId }}</dd>
                </div>
                <div>
                  <dt class="text-ink-3">Created</dt>
                  <dd class="mt-0.5 text-ink">{{ ago(test.createdAt) ?? 'not recorded' }}</dd>
                </div>
                <div>
                  <dt class="text-ink-3">Updated</dt>
                  <dd class="mt-0.5 text-ink">{{ ago(test.updatedAt) ?? 'not recorded' }}</dd>
                </div>
              </dl>

              <!-- The document itself, read-only. This page reads a test; the
                   one place it can be edited is Cases, and a second editable
                   copy of the same text is two answers to "what is saved". -->
              <div class="border-t border-hairline">
                <p class="eyebrow px-4 pb-1.5 pt-3">Case document</p>
                <pre class="max-h-72 overflow-auto whitespace-pre-wrap break-words px-4 pb-4 font-mono text-[11.5px] leading-relaxed text-ink-2">{{ test.flow }}</pre>
              </div>
            </template>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
