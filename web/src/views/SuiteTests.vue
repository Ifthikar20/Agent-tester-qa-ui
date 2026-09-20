<script setup>
/**
 * The suite's tests, as a library: what they DO, one line each.
 *
 * Cases shows you the document — the flow, its `%% at` marks, its entry
 * fingerprint — which is what you want when you are editing one and noise when
 * you only want to know what the suite covers. This page is the other
 * question, and it does not edit: read it, choose some, run them.
 *
 * It used to answer that question with a fat card per test and every step
 * spelled out underneath, which reads beautifully at four tests and is
 * unusable at forty — the thing you came for (does this suite cover checkout,
 * and did it pass?) was three screens of scrolling away. So the steps moved
 * down a level, onto the test's own page, and what is left here is a table: a
 * name, how big it is, where it came from, and how it went last time. One row
 * is one glance; the whole suite is one screen.
 *
 * The decisions — what "failing" means, which rows a search keeps, how a last
 * run reads — live in `@/tests`, not in this template, so the count above the
 * list and the rows in it cannot disagree. The parsing still happens on the
 * runner, because the parser lives there; a test whose document no longer
 * reads says so on its own row rather than emptying the page, and it offers
 * the script instead of a Run it could not honour.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { sayAction } from '@lang';
import { lastRunLook, selectTests, statusCounts } from '@/tests';
import Btn from '@/components/Btn.vue';
import EmptyState from '@/components/EmptyState.vue';
import TestPrompt from '@/components/TestPrompt.vue';

const route = useRoute();
const router = useRouter();
const live = useLive();

const id = computed(() => String(route.params.id));
const suite = ref(null);
const tests = ref([]);
const loading = ref(true);
const error = ref(null);
/** The prompt, over this page: the first test starts by typing, not by navigating. */
const asking = ref(false);

const q = ref('');
const status = ref('all');
const source = ref('all');
const sort = ref('recent');

/**
 * The filter vocabularies live here rather than in `@/tests`, unlike the
 * defects page, whose lists are exported from `@/defects`. That module is a
 * pure helper over the payload and these are five labels and five tooltips —
 * words, which change when somebody argues about wording, not when the
 * filtering changes. Keeping them beside the markup they label is the smaller
 * lie than pretending they are logic.
 */
const STATUSES = [
  { key: 'all', label: 'All', title: 'Every test in this suite' },
  { key: 'passing', label: 'Passing', title: 'Green the last time it was run' },
  { key: 'failing', label: 'Failing', title: 'Red the last time it was run' },
  { key: 'never', label: 'Never run', title: 'Written, but never tried' },
  { key: 'broken', label: 'Broken', title: 'The document no longer reads as a script' },
];
const SOURCES = [
  { key: 'all', label: 'All sources' },
  { key: 'recorded', label: 'Recorded' },
  { key: 'written', label: 'Written' },
  { key: 'generated', label: 'Generated' },
];
const SORTS = [
  { key: 'recent', label: 'Recently updated' },
  { key: 'name', label: 'Name' },
  { key: 'steps', label: 'Steps' },
  { key: 'run', label: 'Last run' },
];

async function load(quiet = false) {
  if (!quiet) loading.value = true;
  error.value = null;
  try {
    const r = await api.suiteTests(id.value);
    suite.value = r.suite; tests.value = r.tests ?? [];
  } catch (e) { if (!quiet) error.value = e.message; }
  finally { loading.value = false; }
}
onMounted(load);
watch(id, () => load());

/** One step, in the words somebody watching a run would use — the search reads these too. */
const say = (s) => { try { return sayAction(s); } catch { return `${s.op} ${s.target ?? s.value ?? s.url ?? ''}`.trim(); } };

const rows = computed(() => selectTests(tests.value, { q: q.value, status: status.value, source: source.value, sort: sort.value }, say));
/**
 * What each status pill would show, counted over the search and the source
 * rather than over the whole suite: a pill that says "Failing 3" and then
 * shows one row because a word is still in the search box is a pill nobody
 * trusts twice. Same list, same function, one filter short.
 */
const counts = computed(() => statusCounts(selectTests(tests.value, { q: q.value, source: source.value }, say)));
const narrowed = computed(() => Boolean(q.value.trim()) || status.value !== 'all' || source.value !== 'all');
function clearFilters() { q.value = ''; status.value = 'all'; source.value = 'all'; }

// ------------------------------------------------------------ the selection
/**
 * Which tests are ticked, by id.
 *
 * The select-all box ticks and unticks exactly the rows VISIBLE after
 * filtering, and nothing else. A select-all that quietly takes in the rows you
 * filtered out is how people run — or, on the day this list grows a delete,
 * destroy — things they had deliberately excluded from view: the screen said
 * four and the action took forty. So it is the shown rows, both ways, and the
 * count on the button is counted the same way.
 *
 * For the same reason the button obeys the filter rather than the Set: a test
 * that is ticked but currently hidden is remembered (loosen the search and it
 * is still ticked) and is not run, because you cannot see it to change your
 * mind about it.
 */
const chosen = ref(new Set());
const picked = computed(() => rows.value.filter((t) => chosen.value.has(t.id)));
const allPicked = computed(() => rows.value.length > 0 && picked.value.length === rows.value.length);

function toggle(t) {
  const next = new Set(chosen.value);
  if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
  chosen.value = next;
}
function tickAll(on) {
  const next = new Set(chosen.value);
  for (const t of rows.value) { if (on) next.add(t.id); else next.delete(t.id); }
  chosen.value = next;
}
// A different suite is a different set of ids; carrying ticks across would be
// a selection of tests that are no longer on the screen.
watch(id, () => { chosen.value = new Set(); });

// ------------------------------------------------------------ running
/**
 * Run it here. The overlay takes the screen the moment the run starts,
 * wherever it was started from, so there is nowhere to navigate to first.
 *
 * Several run one after another rather than at once, because there is one
 * browser and a second run would be queued behind the first anyway — better to
 * say so with a counting label than to fire five requests and let the runner
 * refuse four. A run that FAILS is a result and the sequence carries on; a run
 * that THROWS is the runner declining — an origin that needs allowing, a busy
 * box, a lost socket — and the remaining tests would throw the same way, so
 * the sequence stops on the first one rather than spraying the same error five
 * times.
 */
const onNow = ref(null);      // the id of the test currently being run, if any
const queue = ref(null);      // { at, of } while a sequence of several is under way

const runnable = computed(() => rows.value.filter((t) => !t.error));
const target = computed(() => (picked.value.length ? picked.value.filter((t) => !t.error) : runnable.value));
const runLabel = computed(() => (queue.value ? `Running ${queue.value.at} of ${queue.value.of}…` : 'Running…'));

async function run(list) {
  if (!list.length || live.running) return;
  error.value = null;
  queue.value = list.length > 1 ? { at: 1, of: list.length } : null;
  try {
    for (const [i, t] of list.entries()) {
      if (queue.value) queue.value = { at: i + 1, of: list.length };
      onNow.value = t.id;
      const r = await api.runSuite(id.value, t.id, live.paceMs);
      if (!r.outcomes?.[0]?.ok) live.say(`${t.name}: ${r.outcomes?.[0]?.error ?? 'failed'}`, 'error');
    }
  } catch (e) {
    if (e.needsOrigin) live.needsOrigin = { origin: e.needsOrigin };
    else error.value = e.message;
  } finally {
    onNow.value = null; queue.value = null;
    // The last-run cells are now stale by definition: ask again, quietly.
    await load(true);
  }
}

/**
 * Pass, fail and never-run, by shape first.
 *
 * Green and red separate by only ΔE 4.1 under deuteranopia, so the glyph does
 * the work and `lastRunLook` supplies the words — "Passed 4h ago", not a
 * coloured dot somebody is expected to decode. Colour is the third thing
 * anyone reads here, and the list survives losing it.
 */
const GLYPH = { pass: '✓', fail: '✕', never: '·' };
const MARK = { pass: 'text-good', fail: 'text-critical', never: 'text-ink-3' };
const ranTitle = (t) => (t.lastRun
  ? `${new Date(t.lastRun.at).toLocaleString()} · ${t.lastRun.passed}/${t.lastRun.total} steps passed`
  : 'This test has never been run');

const record = () => router.push({ path: '/console', query: { suite: id.value } });
</script>

<template>
  <div>
    <p v-if="loading" class="text-[13.5px] text-ink-3">Reading the suite’s tests…</p>
    <p v-else-if="error && !tests.length" class="rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ error }}</p>

    <!-- Nothing here yet. The way to get a test is to ask for one in words or
         to demonstrate one, so the empty state offers both rather than
         explaining what a test is. -->
    <template v-else-if="!tests.length">
      <EmptyState title="No tests yet"
                  body="A test is a flow this suite can replay — sign in, check out, whatever has to keep working. Describe one in words and the runner will draft it, or demonstrate it once and it will write itself down.">
        <div class="flex flex-wrap items-center justify-center gap-2">
          <Btn @click="asking = true">Create a test</Btn>
          <button type="button" class="rounded-full border border-hairline px-4 py-2 text-[13.5px] hover:border-ink/25"
                  @click="record">Record one instead</button>
        </div>
      </EmptyState>
    </template>

    <template v-else>
      <p v-if="error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ error }}</p>

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <h2 class="text-[15px] font-medium">{{ tests.length }} test{{ tests.length === 1 ? '' : 's' }}</h2>
        <!-- Not disabled while a run is going, unlike the Run buttons beside
             it. Writing the next test needs no browser — the prompt hands a
             sentence to the chat and nothing touches the runner until somebody
             presses a button on the other side. The one moment this would have
             been greyed out is the moment somebody hides the run overlay to go
             and write the next one, which is exactly when they want it. -->
        <Btn class="ml-auto" variant="ghost" @click="asking = true">Add test</Btn>
        <!-- One primary press, and it says what it is about to do. With nothing
             ticked that is the list in front of you; with a selection it is the
             selection, counted, so nobody has to work out from a label whether
             their four ticks or the other thirty-six are what is about to
             drive a browser for two minutes. -->
        <Btn :busy="!!onNow" :busy-label="runLabel" :disabled="live.running || !target.length"
             @click="run(target)">
          {{ picked.length ? `Run ${picked.length} selected` : 'Run all' }}
        </Btn>
      </div>

      <!-- The controls: a search, the status in one press, where the test came
           from, the order. They narrow the one list, and the pills say how many
           are behind each so choosing a filter is never a guess. The shapes are
           the defects page's shapes on purpose — two lists in one product
           should not need learning twice. -->
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <label class="relative min-w-0 grow basis-52">
          <span class="sr-only">Search tests</span>
          <input v-model="q" type="search" spellcheck="false" placeholder="Search by name, or by what a step does…"
                 class="w-full rounded-full border border-hairline bg-panel py-1.5 pl-9 pr-3.5 text-[13px] outline-none focus:border-ink/25">
          <svg viewBox="0 0 16 16" class="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.2" /><path d="m10.3 10.3 3.2 3.2" />
          </svg>
        </label>
        <div class="flex items-center gap-1 rounded-full border border-hairline p-0.5" role="tablist" aria-label="Status">
          <button v-for="f in STATUSES" :key="f.key" type="button" role="tab" :aria-selected="status === f.key" :title="f.title"
                  class="rounded-full px-3 py-1 text-[12.5px] transition"
                  :class="status === f.key ? 'bg-brand-50 font-medium text-brand-2' : 'text-ink-2 hover:text-ink'"
                  @click="status = f.key">
            {{ f.label }} <span class="tabular-nums text-ink-3">{{ counts[f.key] }}</span>
          </button>
        </div>
        <select v-model="source" aria-label="Source" class="rounded-full border border-hairline bg-panel px-3 py-1.5 text-[12.5px] outline-none focus:border-ink/25">
          <option v-for="s in SOURCES" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
        <select v-model="sort" aria-label="Sort" class="ml-auto rounded-full border border-hairline bg-panel px-3 py-1.5 text-[12.5px] outline-none focus:border-ink/25">
          <option v-for="s in SORTS" :key="s.key" :value="s.key">by {{ s.label.toLowerCase() }}</option>
        </select>
        <button v-if="narrowed" type="button" class="text-[12.5px] text-ink-3 underline underline-offset-2 hover:text-ink" @click="clearFilters">Clear</button>
      </div>

      <section class="card overflow-hidden">
        <div class="table-head grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 border-b border-hairline px-4 py-2 md:grid-cols-[auto_minmax(0,1fr)_9.5rem_4.5rem] md:gap-x-4 md:px-5">
          <input type="checkbox" class="size-3.5 shrink-0 accent-brand" :checked="allPicked"
                 :indeterminate.prop="picked.length > 0 && !allPicked"
                 :disabled="!rows.length" aria-label="Select every test shown"
                 title="Ticks the tests this filter is showing — nothing hidden" @change="tickAll($event.target.checked)">
          <span>Tests</span>
          <span class="hidden text-right md:block">Last run</span>
          <span class="hidden md:block" />
        </div>

        <!-- Two empty states, because these are two different situations and
             one sentence cannot serve both: a suite with no tests needs telling
             how to get one, and a search with no hits needs telling that the
             tests are still there. -->
        <div v-if="!rows.length" class="p-4 sm:p-5">
          <EmptyState title="No test matches this search"
                      :body="`All ${tests.length} test${tests.length === 1 ? '' : 's'} in this suite are still here — the search, the status or the source is hiding the rest.`">
            <button type="button" class="rounded-full border border-hairline px-4 py-2 text-[13.5px] hover:border-ink/25" @click="clearFilters">Clear the filters</button>
          </EmptyState>
        </div>

        <ul v-else class="divide-y divide-hairline">
          <li v-for="t in rows" :key="t.id"
              class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 px-4 py-2.5 transition hover:bg-ink/[0.025] md:grid-cols-[auto_minmax(0,1fr)_9.5rem_4.5rem] md:items-center md:gap-x-4 md:px-5"
              :class="chosen.has(t.id) && 'bg-brand-50/40'">
            <input type="checkbox" class="mt-1 size-3.5 shrink-0 accent-brand md:mt-0" :checked="chosen.has(t.id)"
                   :aria-label="`Select ${t.name}`" @change="toggle(t)">

            <div class="min-w-0">
              <RouterLink :to="{ name: 'suite-test', params: { id, testId: t.id } }"
                          class="block truncate text-[13.5px] font-medium text-ink hover:text-brand-2" :title="t.name">
                {{ t.name }}
              </RouterLink>
              <p class="mt-0.5 truncate text-[12px] text-ink-3">
                {{ t.steps?.length ?? 0 }} step{{ (t.steps?.length ?? 0) === 1 ? '' : 's' }} · {{ t.source ?? 'written' }}
              </p>
              <!-- A test whose document no longer parses cannot be run, so it is
                   said quietly on the row rather than shouted in a panel: it is
                   one test's problem, not the page's. -->
              <p v-if="t.error" class="mt-0.5 truncate text-[12px] text-critical/85" :title="t.error">
                Does not read as a script: {{ t.error }}
              </p>
              <!-- Narrow screens have no columns, so the verdict sits under the name. -->
              <p class="mt-1 flex items-center gap-1.5 text-[12.5px] md:hidden" :title="ranTitle(t)">
                <span class="w-3 shrink-0" :class="MARK[lastRunLook(t.lastRun).state]" aria-hidden="true">{{ GLYPH[lastRunLook(t.lastRun).state] }}</span>
                <span :class="lastRunLook(t.lastRun).tone">{{ lastRunLook(t.lastRun).text }}</span>
              </p>
            </div>

            <p class="hidden items-center justify-end gap-1.5 text-[12.5px] md:flex" :title="ranTitle(t)">
              <span class="shrink-0" :class="MARK[lastRunLook(t.lastRun).state]" aria-hidden="true">{{ GLYPH[lastRunLook(t.lastRun).state] }}</span>
              <span class="truncate" :class="lastRunLook(t.lastRun).tone">{{ lastRunLook(t.lastRun).text }}</span>
            </p>

            <div class="col-start-2 justify-self-start md:col-start-auto md:justify-self-end">
              <RouterLink v-if="t.error" :to="{ name: 'suite-cases', params: { id } }"
                          class="inline-flex items-center whitespace-nowrap rounded-full border border-hairline bg-panel px-3 py-1.5 text-[12.5px] font-medium hover:border-ink/25"
                          title="The runner cannot read this one — the script is where it gets fixed">
                Edit as script
              </RouterLink>
              <!-- Forty rows and forty buttons all saying "Run": the title is
                   what tells a screen reader, and a hovering cursor, which one. -->
              <Btn v-else size="sm" variant="ghost" :busy="onNow === t.id" busy-label="Running…" :disabled="live.running"
                   :title="`Run ${t.name}`" @click="run([t])">Run</Btn>
            </div>
          </li>
        </ul>

        <p v-if="rows.length && narrowed" class="border-t border-hairline px-5 py-2.5 text-[12px] text-ink-3">
          Showing {{ rows.length }} of {{ tests.length }} test{{ tests.length === 1 ? '' : 's' }}<template v-if="picked.length"> · {{ picked.length }} ticked</template>
        </p>
      </section>
    </template>

    <TestPrompt v-if="asking" :suite="suite" @close="asking = false" />
  </div>
</template>
