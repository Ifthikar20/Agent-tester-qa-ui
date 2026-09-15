<script setup>
/**
 * Cases: the flows this suite runs.
 *
 * A case is stored as case text — the language that is also the script —
 * so what you read here is exactly what runs. Editing one re-validates against
 * the same parser the executor uses, which is why an unrunnable edit is refused
 * at save rather than discovered at 2am.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { api } from '@/api';
import { fixLines, forSuite, kindLabel, positionLine, recordedAt, seenLabel, tierLabel, timeOf, whyLine } from '@/fixes';
import { useRouter } from 'vue-router';
import { useSuites } from '@/stores/suites';
import { useLive } from '@/stores/live';
import Field from '@/components/Field.vue';
import FlowBox from '@/components/FlowBox.vue';
import EmptyState from '@/components/EmptyState.vue';
import Btn from '@/components/Btn.vue';

const router = useRouter();
const store = useSuites();
const live = useLive();
const suite = computed(() => store.current);

const open = ref(null);          // case id being edited
const edit = ref({ name: '', flow: '' });
const draft = ref({ name: '', pageId: '', flow: '' });
const adding = ref(false);
const error = ref(null);
const running = ref(null);

function startEdit(c) {
  open.value = open.value === c.id ? null : c.id;
  edit.value = { name: c.name, flow: c.flow };
}

async function save(c) {
  error.value = null;
  try { await api.updateCase(suite.value.id, c.id, edit.value); open.value = null; await store.refresh(); }
  catch (e) { error.value = e.message; }
}
async function remove(c) {
  if (!confirm(`Delete "${c.name}"?`)) return;
  await api.removeCase(suite.value.id, c.id);
  await store.refresh();
}
async function add() {
  error.value = null;
  try {
    await api.addCase(suite.value.id, { ...draft.value, pageId: draft.value.pageId || null });
    draft.value = { name: '', pageId: '', flow: '' };
    adding.value = false;
    await store.refresh();
  } catch (e) { error.value = e.message; }
}
/**
 * One case, watched. Same reasoning as Run suite: a run you cannot see is a
 * progress bar with the bar taken out.
 */
async function runOne(c) {
  running.value = c.id; error.value = null;
  const id = suite.value.id;
  await router.push({ path: '/console', query: { suite: id } });
  await nextTick();
  try {
    const r = await api.runSuite(id, c.id, live.paceMs);
    if (!r.outcomes[0]?.ok) live.say(`${c.name}: ${r.outcomes[0]?.error ?? 'failed'}`, 'error');
  } catch (e) {
    if (e.needsOrigin) live.needsOrigin = { origin: e.needsOrigin };
    else live.say(e.message, 'error');
  } finally { running.value = null; }
}

/** Whatever the recorder has produced, dropped straight into a new case. */
function fromRecorder() {
  adding.value = true;
  draft.value = { name: 'Recorded flow', pageId: '', flow: live.recordedFlow };
}
const pageName = (id) => suite.value.pages.find((p) => p.id === id)?.name ?? null;

/**
 * Suggested fixes: what the runner had to do to get a saved case through, kept
 * until a person decides.
 *
 * A run that passed with a fix did not change the case — it cannot, because a
 * test that rewrites itself whenever the page moves stops being a test. So the
 * change waits here, as the step that was recorded beside the step that worked,
 * and only Accept writes it. Reject is a decision too: the runner stops
 * suggesting it.
 *
 * The list is the organisation's pending suggestions, filtered to this suite.
 * It is re-read when the runner says the count changed and when a run ends, so
 * a fix made by the run you just watched is here when you come back.
 *
 * A suggestion goes stale when the case is edited after it was made — the step
 * it would change is no longer the step it saw. Accepting one answers 409, and
 * rather than a red box the suggestion leaves the list with a sentence saying
 * why it went.
 */
const suggestions = ref([]);
const fixesOpen = ref(null);     // case id whose suggestions are showing
const deciding = ref(null);      // { id, as: 'accept' | 'reject' } while one is in flight
const notices = ref({});         // case id -> { tone, text }

async function loadFixes() {
  try { suggestions.value = (await api.listFixes('pending')).fixes ?? []; }
  catch { suggestions.value = []; }   // a runner without fixes: nothing to suggest, and no reason to say so
}
watch(() => suite.value?.id, (id) => { if (id) loadFixes(); }, { immediate: true });
watch(() => live.fixesPending, (now, before) => { if (now !== before) loadFixes(); });
watch(() => live.running, (now, before) => { if (before && !now) loadFixes(); });

const byCase = computed(() => forSuite(suggestions.value, suite.value?.id));
const drop = (id) => { suggestions.value = suggestions.value.filter((s) => s.id !== id); };
const notice = (c, tone, text) => { notices.value = { ...notices.value, [c.id]: text ? { tone, text } : null }; };
const NOTICE = {
  good: 'border-good/25 bg-good/5 text-good',
  warn: 'border-warn/25 bg-warn/5 text-warn',
  bad: 'border-critical/25 bg-critical/5 text-critical',
};

function toggleFixes(c) {
  fixesOpen.value = fixesOpen.value === c.id ? null : c.id;
  notice(c, null, null);
}

async function accept(c, f) {
  deciding.value = { id: f.id, as: 'accept' };
  notice(c, null, null);
  try {
    const r = await api.acceptFix(f.id);
    drop(f.id);
    // The case as the runner now stores it, shown at once rather than after
    // the refresh below — and an edit you had open but not touched follows it,
    // so saving it does not quietly put the old step back.
    const row = suite.value.cases.find((x) => x.id === (r.case?.caseId ?? c.id));
    if (row && typeof r.case?.flow === 'string') {
      if (open.value === row.id && edit.value.flow === row.flow) edit.value = { ...edit.value, flow: r.case.flow };
      row.flow = r.case.flow;
      if (typeof r.case.steps === 'number') row.steps = r.case.steps;
    }
    notice(c, 'good', 'Accepted. The case now runs the step that worked.');
    await store.refresh();
  } catch (e) {
    if (e.stale) { drop(f.id); notice(c, 'warn', e.message); }
    else notice(c, 'bad', e.message);
  } finally { deciding.value = null; }
}

async function reject(c, f) {
  deciding.value = { id: f.id, as: 'reject' };
  notice(c, null, null);
  try { await api.rejectFix(f.id); drop(f.id); }
  catch (e) {
    if (e.stale) { drop(f.id); notice(c, 'warn', e.message); }
    else notice(c, 'bad', e.message);
  } finally { deciding.value = null; }
}

// Suggestions carry ISO timestamps (timeOf), not epoch numbers.
const when = (t) => {
  const m = Math.round((Date.now() - timeOf(t)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
</script>

<template>
  <div>
    <div class="mb-6 flex items-end gap-3">
      <div>
        <h1 class="display text-3xl">Cases</h1>
        <p class="mt-1 max-w-2xl text-[14px] leading-relaxed text-ink-2">
          Each one is a flow you can read. Record it in the console, or write it here.
        </p>
      </div>
      <div class="ml-auto flex gap-2">
        <button v-if="live.recordedFlow" class="rounded-full border border-hairline px-4 py-2 text-[13px]"
                @click="fromRecorder">
          Use the recording ({{ live.recordedCount }} steps)
        </button>
        <button class="rounded-full bg-brand hover:bg-brand-2 px-4 py-2 text-[13px] font-medium text-white"
                @click="adding = !adding">{{ adding ? 'Cancel' : 'New case' }}</button>
      </div>
    </div>

    <p v-if="error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ error }}</p>

    <section v-if="adding" class="card mb-4 p-5">
      <div class="grid gap-3 sm:grid-cols-2">
        <Field label="Case name"><input v-model="draft.name" placeholder="Sign in works"></Field>
        <Field label="Page" hint="Optional — a case carries its own entry URL.">
          <select v-model="draft.pageId">
            <option value="">Not tied to a page</option>
            <option v-for="p in suite.pages" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </Field>
      </div>
      <div class="mt-3">
        <Field label="Test case" hint="One edge is one interaction. Several can go under it, one per line.">
          <FlowBox v-model="draft.flow" :rows="10" />
        </Field>
      </div>
      <button class="mt-4 rounded-full bg-brand hover:bg-brand-2 px-4 py-2 text-[13px] font-medium text-white disabled:bg-ink/[0.05] disabled:text-ink-3"
              :disabled="!draft.name || !draft.flow" @click="add">Save case</button>
    </section>

    <EmptyState v-if="!suite.cases.length && !adding" title="No cases yet"
                body="Open the console, press Record, and drive the page by hand — the recorder names every element from the accessibility tree and hands you back a script." >
      <RouterLink :to="{ path: '/console', query: { suite: suite.id, url: suite.pages[0]?.url } }"
                  class="rounded-full bg-brand hover:bg-brand-2 px-4 py-2 text-[13.5px] font-medium text-white">Open the console</RouterLink>
    </EmptyState>

    <section v-for="c in suite.cases" :key="c.id" class="card mb-3 p-5">
      <div class="flex items-center gap-3">
        <div class="min-w-0">
          <p class="truncate text-[14.5px] font-medium">{{ c.name }}</p>
          <p class="mt-0.5 text-[12px] text-ink-3">
            {{ c.steps }} step{{ c.steps === 1 ? '' : 's' }} · {{ c.source }}
            <template v-if="pageName(c.pageId)"> · {{ pageName(c.pageId) }}</template>
          </p>
        </div>
        <div class="ml-auto flex shrink-0 gap-2">
          <button v-if="byCase[c.id]?.length" type="button"
                  class="flex items-center gap-1.5 rounded-full bg-warn/10 px-3 py-1.5 text-[12.5px] font-medium text-warn hover:bg-warn/15"
                  :aria-expanded="fixesOpen === c.id" @click="toggleFixes(c)">
            Suggested fixes
            <span class="rounded-full bg-warn/15 px-1.5 text-[11.5px] tabular-nums">{{ byCase[c.id].length }}</span>
          </button>
          <Btn variant="ghost" size="sm" :busy="running === c.id" busy-label="Running…"
               :disabled="live.running" @click="runOne(c)">Run</Btn>
          <button class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px]" @click="startEdit(c)">
            {{ open === c.id ? 'Close' : 'Edit' }}
          </button>
          <button class="rounded-full px-2 py-1.5 text-[12.5px] text-ink-3 hover:text-critical" @click="remove(c)">✕</button>
        </div>
      </div>

      <p v-if="notices[c.id]" class="mt-3 rounded-lg border px-3 py-2 text-[12.5px]" :class="NOTICE[notices[c.id].tone]"
         role="status">{{ notices[c.id].text }}</p>

      <div v-if="fixesOpen === c.id && byCase[c.id]?.length" class="mt-4 rounded-xl border border-hairline bg-ground p-4">
        <p class="max-w-2xl text-[13px] leading-relaxed text-ink-2">
          The runner needed these to get this case through. Nothing in the case changes until you accept one.
        </p>
        <ul class="mt-3 space-y-3">
          <li v-for="f in byCase[c.id]" :key="f.id" class="rounded-lg border border-hairline bg-panel p-3.5">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p class="text-[13.5px] font-medium">{{ kindLabel(f.kind) }}</p>
              <span class="rounded-full bg-ink/[0.06] px-1.5 py-px text-[11px] text-ink-2">{{ tierLabel(f.tier) }}</span>
              <span class="text-[12px] text-ink-3">
                step {{ f.step + 1 }} · {{ seenLabel(f.seen) }}<template v-if="f.lastSeenAt"> · last {{ when(f.lastSeenAt) }}</template>
              </span>
            </div>
            <!-- The step as recorded, then what would replace it or go in before
                 it — the same language the case is written in. A moved element
                 changes no step, only where the case recorded it landing, so that
                 reads as a sentence under the step: from the case's own mark to
                 where the element is now. -->
            <dl class="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <template v-for="l in fixLines(f)" :key="l.role">
                <template v-if="l.role !== 'at'">
                  <dt class="pt-px text-[11.5px] text-ink-3">{{ l.label }}</dt>
                  <dd class="whitespace-pre-wrap font-mono text-[12px]" :class="l.role === 'from' ? 'text-ink-3' : 'text-ink'">{{ l.text }}</dd>
                </template>
              </template>
              <dd v-if="positionLine(f, recordedAt(c.flow, f.step))" class="col-span-2 mt-0.5 text-[12.5px] tabular-nums text-ink">
                {{ positionLine(f, recordedAt(c.flow, f.step)) }}
              </dd>
            </dl>
            <p class="mt-2.5 text-[13px] text-ink-2">{{ f.note }}</p>
            <p v-if="whyLine(f)" class="mt-1 text-[12.5px] text-ink-3">{{ whyLine(f) }}</p>
            <div class="mt-3 flex gap-2">
              <Btn size="sm" :busy="deciding?.id === f.id && deciding.as === 'accept'" busy-label="Accepting…"
                   :disabled="!!deciding" @click="accept(c, f)">Accept</Btn>
              <Btn size="sm" variant="ghost" :busy="deciding?.id === f.id && deciding.as === 'reject'" busy-label="Rejecting…"
                   :disabled="!!deciding" @click="reject(c, f)">Reject</Btn>
            </div>
          </li>
        </ul>
      </div>

      <div v-if="open === c.id" class="mt-4 border-t border-hairline pt-4">
        <Field label="Name"><input v-model="edit.name"></Field>
        <div class="mt-3">
          <Field label="Flow"><FlowBox v-model="edit.flow" :rows="12" /></Field>
        </div>
        <button class="mt-4 rounded-full bg-brand hover:bg-brand-2 px-4 py-2 text-[13px] font-medium text-white" @click="save(c)">
          Save
        </button>
      </div>
      <FlowBox v-else :model-value="c.flow" :rows="Math.min(16, c.flow.split('\n').length)" readonly class="mt-3" />
    </section>
  </div>
</template>
