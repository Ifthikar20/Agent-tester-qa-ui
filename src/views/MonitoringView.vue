<script setup>
/**
 * Agentic monitoring.
 *
 * The console drives a page; this page watches one. The stage is the same
 * video of the same browser (Stage.vue), and picking an element on it is the
 * console's own pointer path: the pointer on the canvas becomes a real
 * mousemove in the driven page, the runner's picker outlines the element
 * INSIDE the page — so the outline arrives in the video — and a click chooses
 * it without reaching the page. The rail is the panel the proof of concept
 * drew inside the page: what was picked, the rule, the monitors. Incidents,
 * with their evidence, sit under the stage.
 *
 * Nothing here decides anything. The runner says when picking is on, what was
 * picked, what state a monitor is in and when an incident opens; the store
 * mirrors it over the one socket, and this view draws the mirror. A button
 * that flipped itself would lie for a round trip and then snap back.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { useSuites } from '@/stores/suites';
import {
  chipTone, describeElement, diffChips, elementFacts, incidentPill, isBlank, llmBadge,
  metricsLine, originOfUrl, projectOf, severityTone, specChips, stateTone, suggestionsFor, verdictSource,
} from '@/monitoring';
import { clock, when } from '@/time';
import TopBar from '@/components/TopBar.vue';
import Btn from '@/components/Btn.vue';
import Field from '@/components/Field.vue';
import AddressBar from '@/components/AddressBar.vue';
import UpgradePrompt from '@/components/UpgradePrompt.vue';
import EmptyState from '@/components/EmptyState.vue';
import Stage from '@/components/Stage.vue';
import Shot from '@/components/Shot.vue';

const live = useLive();
const stage = ref(null);
const ruleBox = ref(null);

const urlBox = ref('');
const opening = ref(null);
const allowing = ref(false);
const error = ref(null);
const loading = ref(false);
const loadError = ref(null);
const arming = ref(false);      // Pick pressed, the runner has not answered yet
const label = ref('');
const rule = ref('');
const adding = ref(false);
const addError = ref(null);
const added = ref(null);        // the label of the monitor just created
const only = ref('open');       // open | all
const pending = ref(null);      // the id whose row action is in flight
const rowError = ref(null);     // { id, msg }

// -------------------------------------------------------------- project
// Which project (suite) this page is about: ?suite= in the address, put
// there by the suite's Monitoring section, its Overview, or the picker in
// the address row. Monitors made here belong to it, and the lists are its
// own; with no project, everything the organisation watches is here.
const route = useRoute();
const router = useRouter();
const suites = useSuites();
const projectId = computed(() => (route.query.suite ? String(route.query.suite) : null));
const project = computed(() => suites.list.find((s) => s.id === projectId.value) ?? null);
const projectPages = ref([]);
const sameUrl = (a, b) => { try { return new URL(a).href === new URL(b).href; } catch { return a === b; } };
const crumbs = computed(() => (project.value
  ? [{ label: 'Test suites', to: '/suites' }, { label: project.value.name, to: `/suites/${project.value.id}` }, { label: 'Monitoring' }]
  : [{ label: 'Agentic monitoring' }]));
async function chooseProject(id) {
  await router.replace({ query: { ...route.query, suite: id || undefined, url: undefined } });
}
// The project's pages go under the address as chips, and its first page into
// the box when the runner is somewhere else — the console's own convention.
watch(projectId, async (id) => {
  projectPages.value = [];
  if (!id) return;
  const s = await api.suite(id).then((r) => r.suite).catch(() => null);
  if (!s || projectId.value !== id) return;
  projectPages.value = s.pages ?? [];
  const home = s.pages?.[0]?.url ?? s.baseUrl;
  if (home && !route.query.url && originOfUrl(live.url) !== originOfUrl(home)) urlBox.value = home;
}, { immediate: true });

const isMine = (m) => !project.value || projectOf(m, suites.list)?.id === project.value.id;
const monitors = computed(() => [...live.monitors].filter(isMine).sort((a, b) => b.createdAt - a.createdAt));
const mineIds = computed(() => new Set(monitors.value.map((m) => m.id)));
const incidents = computed(() => live.incidents
  .filter((i) => (!project.value || mineIds.value.has(i.monitorId)) && (only.value === 'all' || i.status === 'open'))
  .sort((a, b) => b.openedAt - a.openedAt));
const openCount = computed(() => (project.value
  ? live.incidents.filter((i) => i.status === 'open' && mineIds.value.has(i.monitorId)).length
  : live.openIncidents));
const suggestions = computed(() => suggestionsFor(live.picked?.snapshot));
const facts = computed(() => elementFacts(live.picked?.snapshot));
const badge = computed(() => llmBadge(live.monitoring));

/**
 * Whether Pick can be pressed, and why not. The runner enforces the same
 * refusals; this exists so a disabled button explains itself.
 */
const canPick = computed(() => {
  if (!live.connected) return { ok: false, why: 'Connect the runner first.' };
  if (live.busy) return { ok: false, why: `${live.driving.org} is driving the runner.` };
  if (isBlank(live.url)) return { ok: false, why: 'Open a page first — the picker needs something to point at.' };
  if (live.running) return { ok: false, why: 'Wait for the run to finish.' };
  if (live.recording) return { ok: false, why: 'Stop the recording first.' };
  return { ok: true, why: '' };
});

// -------------------------------------------------------------- loading
async function load() {
  loading.value = true;
  loadError.value = null;
  try { await live.loadMonitoring(); } catch (e) { loadError.value = e.message; }
  finally { loading.value = false; }
}
onMounted(async () => {
  await load();
  if (!suites.listed) await suites.loadList().catch(() => null);
  // Arriving with ?url= (a suite's Monitoring section, its Overview) opens
  // that page, unless the runner is already on it.
  if (route.query.url) {
    urlBox.value = String(route.query.url);
    if (!sameUrl(live.url, route.query.url)) open();
  } else if (!isBlank(live.url) && !urlBox.value) urlBox.value = live.url;
  window.addEventListener('keydown', onEscape);
});
// The page stays mounted from one suite's Monitoring to the next, so a new
// ?url= has to be acted on, not only the first.
watch(() => route.query.url, (u) => {
  if (!u || sameUrl(live.url, u)) return;
  urlBox.value = String(u);
  open();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape);
  // Leaving mid-pick: the page must not keep swallowing clicks for nobody.
  if (live.picking || arming.value) live.send({ t: 'monitor.pick.stop' });
});
// A restarted runner has its monitors on disk; read them again when it is back.
watch(() => live.connected, (c) => { if (c) load(); });
watch(() => live.painted, (p) => { if (p) opening.value = null; });
watch(() => live.picked, (p) => {
  if (!p) return;
  label.value = p.label || describeElement(p.snapshot);
  rule.value = '';
  addError.value = null;
  added.value = null;
  nextTick(() => ruleBox.value?.focus());
});
watch(() => [live.picking, live.pickError, live.connected], () => { arming.value = false; });

// ------------------------------------------------------- opening a page
// The console's own open and allow, so a person can point the runner at
// their site from here as well.
async function open() {
  error.value = null;
  if (!urlBox.value.trim()) return;
  live.needsOrigin = null;
  opening.value = urlBox.value.trim();
  live.painted = false;
  live.send({ t: 'open', url: opening.value });
}
async function allow() {
  allowing.value = true;
  try {
    const { origin, url, redirected } = live.needsOrigin;
    await api.allowOrigin(origin);
    live.needsOrigin = null;
    if (url && !redirected) { urlBox.value = url; open(); }
  } catch (e) {
    if (e.entitlement) live.upgrade = { ...e.entitlement, of: 'origin.add' };
    else error.value = e.message;
  } finally { allowing.value = false; }
}

// -------------------------------------------------------------- picking
function startPick() {
  live.pickError = null;
  added.value = null;
  arming.value = true;
  live.send({ t: 'monitor.pick.start' });
  stage.value?.focus();
}
function cancelPick() {
  if (!live.picking && !arming.value) return;
  live.send({ t: 'monitor.pick.stop' });
  arming.value = false;
}
// Escape anywhere on the page. The Stage stops its own Escape from reaching
// here, so one keypress sends one stop.
function onEscape(e) {
  if (e.key === 'Escape' && (live.picking || arming.value)) { e.preventDefault(); cancelPick(); }
}
function useSuggestion(s) {
  rule.value = rule.value.trim() ? `${rule.value.trim()}; ${s}` : s;
  ruleBox.value?.focus();
}
async function addMonitor() {
  const p = live.picked;
  if (!p) return;
  if (!rule.value.trim()) {
    addError.value = 'Describe what to watch for (or click a suggestion).';
    ruleBox.value?.focus();
    return;
  }
  adding.value = true;
  addError.value = null;
  try {
    // No baseline is sent: the runner measures the element now, which is
    // fresher than the snapshot this page holds from the moment of the pick.
    const { monitor } = await api.createMonitor({
      selector: p.selector, fingerprint: p.fingerprint, label: label.value.trim() || p.label,
      ruleText: rule.value.trim(), url: p.url, tag: p.snapshot?.tag,
      suiteId: project.value?.id ?? undefined,
    });
    live.upsertMonitor(monitor);
    added.value = monitor.label;
    live.picked = null;
    rule.value = '';
    label.value = '';
    // Takes the selection outline off the page.
    live.send({ t: 'monitor.pick.stop' });
  } catch (e) {
    if (e.entitlement) live.upgrade = { ...e.entitlement, of: 'monitor.add' };
    else addError.value = e.message;
  } finally { adding.value = false; }
}

// ---------------------------------------------------------- row actions
/** One shape for every row action: busy on the row, the error beside it. */
async function act(id, fn) {
  pending.value = id;
  rowError.value = null;
  try { await fn(); } catch (e) { rowError.value = { id, msg: e.message }; }
  finally { pending.value = null; }
}
const pause = (m) => act(m.id, async () => live.upsertMonitor((await api.pauseMonitor(m.id)).monitor));
const resume = (m) => act(m.id, async () => live.upsertMonitor((await api.resumeMonitor(m.id)).monitor));
function remove(m) {
  if (!confirm(`Delete "${m.label}"? Its incidents and their clips go with it.`)) return;
  act(m.id, async () => { await api.removeMonitor(m.id); live.dropMonitor(m.id); });
}
const resolve = (inc) => act(inc.id, async () => {
  const r = await api.resolveIncident(inc.id);
  live.upsertIncident(r.incident);
  if (r.monitor) live.upsertMonitor(r.monitor);
});
</script>

<template>
  <TopBar :crumbs="crumbs">
    <template #actions>
      <span v-if="badge" :title="badge.title" class="rounded-full border px-3 py-1.5 text-[12.5px]"
            :class="badge.claude ? 'border-brand/20 bg-brand-50 font-medium text-brand-2' : 'border-hairline text-ink-2'">
        {{ badge.label }}
      </span>
      <span class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px] text-ink-2">
        {{ live.connected ? 'Runner connected' : 'Runner offline' }}
      </span>
    </template>
  </TopBar>

  <div class="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_380px]">
    <!-- stage -------------------------------------------------------- -->
    <div>
      <AddressBar :url="live.url" :nav="live.currentNav" />
      <Stage ref="stage" :opening="opening" :mode="live.picking ? 'pick' : 'drive'" @cancel="cancelPick" />

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <!-- The project first, then the address: what is watched belongs to
             a project, and the project's own pages are one click below. -->
        <select :value="projectId ?? ''" aria-label="Project" title="The project these monitors belong to"
                class="max-w-[14rem] rounded-full border border-hairline bg-panel px-3 py-2 text-[13px] outline-none focus:border-ink/25"
                @change="chooseProject($event.target.value)">
          <option value="">Any project</option>
          <option v-for="s in suites.list" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <input v-model="urlBox" spellcheck="false" aria-label="URL to watch"
               placeholder="staging.acme.com/dashboard"
               class="min-w-0 flex-1 rounded-full border border-hairline bg-panel px-4 py-2 text-[13.5px] outline-none focus:border-ink/25"
               @keyup.enter="open">
        <Btn :busy="!!opening" busy-label="Opening…" @click="open">Open</Btn>
      </div>
      <div v-if="project && projectPages.length" class="mt-2 flex flex-wrap items-center gap-1.5">
        <span class="text-[12px] text-ink-3">{{ project.name }} pages:</span>
        <button v-for="p in projectPages" :key="p.id" type="button"
                class="rounded-full border px-2.5 py-1 text-[12px]"
                :class="sameUrl(live.url, p.url) ? 'border-brand/30 bg-brand-50 font-medium text-brand-2' : 'border-hairline hover:border-ink/30'"
                :title="p.url" @click="urlBox = p.url; open()">
          {{ p.name }} <span class="font-mono text-ink-3">{{ p.path }}</span>
        </button>
      </div>

      <p class="mt-2 text-[12.5px] text-ink-3">
        <template v-if="live.picking">
          Picking: hover the page above and click the element to watch. Clicking a button or a link
          while picking never triggers it. Esc cancels.
        </template>
        <template v-else>
          Point at the page above and scroll it with your wheel — clicks and keys go to the page you
          are watching, never to this one. Press <b class="font-medium text-ink-2">Pick element</b> to choose what to watch.
        </template>
      </p>

      <UpgradePrompt v-if="live.upgrade" class="mt-3" :limit="live.upgrade.limit" :plan="live.upgrade.plan" @dismiss="live.upgrade = null" />

      <div v-if="live.needsOrigin" class="mt-3 card wash-warm p-4">
        <p class="text-[13.5px] font-medium">{{ live.needsOrigin.origin }} is not allowed yet.</p>
        <p v-if="live.needsOrigin.redirected" class="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
          The page you opened redirected here. A different host or scheme is a different
          origin — allowing <code>example.com</code> does not allow <code>www.example.com</code>.
        </p>
        <p v-else class="mt-1 text-[13px] text-ink-2">The gate only opens for a person. Nothing generated can reach this button.</p>
        <div class="mt-3 flex gap-2">
          <Btn :busy="allowing" busy-label="Allowing…" @click="allow">
            {{ live.needsOrigin.url && !live.needsOrigin.redirected ? 'Allow it and open' : 'Allow it' }}
          </Btn>
          <button class="rounded-full border border-hairline px-4 py-2 text-[13px]" @click="live.needsOrigin = null">Cancel</button>
        </div>
      </div>

      <!-- incidents ------------------------------------------------- -->
      <section class="card mt-4 p-5">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-[15px] font-medium">Incidents</h2>
          <span v-if="openCount" class="rounded-full bg-critical/10 px-2 py-0.5 text-[12px] font-medium text-critical">
            {{ openCount }} open
          </span>
          <div class="flex items-center gap-2">
            <button v-for="f in ['open', 'all']" :key="f"
                    class="rounded-full px-3.5 py-1.5 text-[13px]"
                    :class="only === f ? 'bg-brand-50 font-medium text-brand-2' : 'border border-hairline hover:border-ink/25'"
                    @click="only = f">
              {{ f === 'open' ? 'Open' : 'Everything' }}
            </button>
          </div>
          <button class="ml-auto rounded-full border border-hairline px-3.5 py-1.5 text-[13px] hover:border-ink/25"
                  @click="load">Refresh</button>
        </div>

        <p v-if="loading" class="mt-3 text-[13.5px] text-ink-3">Reading the runner’s monitors…</p>
        <p v-if="loadError" class="mt-3 rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">
          {{ loadError }}
        </p>

        <EmptyState v-if="!loading && !incidents.length" class="mt-4"
                    :title="only === 'open' ? 'No incidents' : 'Nothing resolved yet'"
                    body="When a monitored element breaks its rule, the evidence lands here — before and after, the numbers, and a verdict." />

        <div v-else class="mt-4">
          <section v-for="inc in incidents" :key="inc.id" class="card mb-3 p-5" :class="inc.status === 'resolved' && 'opacity-75'">
            <div class="flex flex-wrap items-start gap-3">
              <span class="mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium" :class="incidentPill(inc).tone">
                {{ incidentPill(inc).label }}
              </span>
              <p class="min-w-0 grow text-[13.5px] font-medium">{{ inc.monitorLabel }}</p>
              <span class="text-[12.5px] tabular-nums text-ink-3">
                {{ clock(inc.openedAt) }}<template v-if="inc.resolvedAt"> → {{ clock(inc.resolvedAt) }}</template> · {{ when(inc.openedAt) }}
              </span>
            </div>
            <p class="mt-1 truncate font-mono text-[11.5px] text-ink-3" :title="inc.selector">{{ inc.selector }}</p>
            <p class="mt-1 text-[12.5px] italic text-ink-2">“{{ inc.ruleText }}”</p>

            <div v-for="x in inc.violations" :key="x.checkId" class="mt-2 rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px]">
              <p>{{ x.message }}</p>
              <p class="mt-0.5 font-mono text-[11.5px] text-ink-2">
                actual {{ x.actual }} · expected {{ x.expected }}<template v-if="x.baseline != null"> · baseline {{ x.baseline }}</template>
              </p>
            </div>

            <div v-if="diffChips(inc.diff).length" class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="d in diffChips(inc.diff)" :key="d" class="rounded-full border border-hairline px-2 py-0.5 font-mono text-[11.5px] text-ink-2">{{ d }}</span>
            </div>

            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <Shot caption="before (baseline)" :name="inc.before?.screenshot" :alt="`${inc.monitorLabel} before`" />
              <Shot caption="after" :name="inc.after?.screenshot" :alt="`${inc.monitorLabel} after`" />
            </div>

            <div v-if="inc.verdict" class="mt-3 rounded-xl border border-hairline bg-ground p-3.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="rounded-full px-2 py-0.5 text-[11.5px] font-medium" :class="severityTone(inc.verdict.severity)">
                  {{ inc.verdict.severity }} severity
                </span>
                <span v-if="verdictSource(inc.verdict)" class="rounded-full border px-2 py-0.5 text-[11.5px]"
                      :class="chipTone(verdictSource(inc.verdict).tone)" :title="verdictSource(inc.verdict).title">
                  {{ verdictSource(inc.verdict).label }}
                </span>
                <span v-if="inc.verdict.violation === false" class="rounded-full border px-2 py-0.5 text-[11.5px]" :class="chipTone('warn')">
                  judge: false alarm
                </span>
              </div>
              <p class="mt-2 text-[13px] leading-relaxed">{{ inc.verdict.explanation }}</p>
            </div>

            <div v-if="inc.status === 'open'" class="mt-3 flex items-center gap-3">
              <Btn size="sm" variant="ghost" :busy="pending === inc.id" busy-label="Resolving…"
                   title="Closes this incident. Relative rules take the current state as their new baseline; an absolute rule that still fails stays acknowledged until the element changes again."
                   @click="resolve(inc)">Resolve &amp; accept current state</Btn>
              <span v-if="rowError && rowError.id === inc.id" class="text-[12.5px] text-critical">{{ rowError.msg }}</span>
            </div>
          </section>
        </div>
      </section>
    </div>

    <!-- rail --------------------------------------------------------- -->
    <div class="grid content-start gap-4">
      <section class="card p-5">
        <h2 class="text-[15px] font-medium">Pick element</h2>

        <template v-if="live.picking">
          <div class="mt-3 flex items-center gap-3">
            <Btn variant="danger" size="sm" @click="cancelPick">Cancel (Esc)</Btn>
            <span class="size-1.5 animate-pulse rounded-full bg-brand" />
            <span class="text-[12.5px] text-ink-2">Hover the page and click the element to watch.</span>
          </div>
        </template>

        <template v-else-if="live.picked">
          <p class="mt-2 text-[12.5px] text-ink-3">{{ describeElement(live.picked.snapshot) }}</p>
          <p class="mt-1 break-all font-mono text-[12px] text-ink">{{ live.picked.selector }}</p>
          <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
            <template v-for="[k, val] in facts" :key="k">
              <dt class="text-ink-3">{{ k }}</dt>
              <dd class="m-0 min-w-0 break-words text-ink">{{ val }}</dd>
            </template>
          </dl>
          <Field label="Label" class="mt-4">
            <input v-model="label" placeholder="Hero copy">
          </Field>
          <Field label="What should the agent watch for?" class="mt-3" :error="addError"
                 hint="Plain English. The compiler turns it into checks the runner evaluates on every change.">
            <textarea ref="ruleBox" v-model="rule" rows="3" placeholder="e.g. Font size must stay 16px and never exceed 20px"
                      @keydown.ctrl.enter.prevent="addMonitor" @keydown.meta.enter.prevent="addMonitor"></textarea>
          </Field>
          <div v-if="suggestions.length" class="mt-2 flex flex-wrap gap-1.5">
            <button v-for="s in suggestions" :key="s" type="button"
                    class="rounded-full border border-hairline px-2.5 py-1 text-[12px] hover:border-ink/30"
                    @click="useSuggestion(s)">{{ s }}</button>
          </div>
          <div class="mt-3 flex gap-2">
            <Btn :busy="adding" busy-label="Adding…" @click="addMonitor">Add monitor</Btn>
            <Btn variant="ghost" @click="startPick">Re-pick</Btn>
          </div>
        </template>

        <template v-else>
          <div class="mt-3">
            <Btn :busy="arming" busy-label="Starting…" :disabled="!canPick.ok" @click="startPick">Pick element</Btn>
          </div>
          <p class="mt-2 text-[12.5px] text-ink-3">
            {{ canPick.ok ? 'Hover the page above and click the element you want to watch.' : canPick.why }}
          </p>
          <p v-if="live.pickError" class="mt-2 rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">
            {{ live.pickError }}
          </p>
          <p v-if="added" class="mt-2 text-[12.5px] text-good">Watching “{{ added }}” now.</p>
        </template>
      </section>

      <section class="card p-5">
        <div class="flex items-baseline gap-2">
          <h2 class="text-[15px] font-medium">Monitors</h2>
          <span v-if="project" class="min-w-0 truncate text-[12px] text-ink-3">in {{ project.name }}</span>
          <span class="ml-auto text-[12.5px] text-ink-3">{{ monitors.length }}</span>
        </div>
        <p v-if="project && live.monitors.length > monitors.length" class="mt-1 text-[11.5px] text-ink-3">
          {{ live.monitors.length - monitors.length }} more on other projects —
          <button type="button" class="underline hover:text-ink" @click="chooseProject('')">show all</button>
        </p>
        <p v-if="!monitors.length" class="mt-3 text-[12.5px] text-ink-3">
          <template v-if="project">No monitors on {{ project.name }} yet. Open one of its pages, pick an element and describe what must stay true.</template>
          <template v-else>No monitors yet. Pick an element and describe what must stay true.</template>
        </p>
        <ul v-else class="mt-3 space-y-3">
          <li v-for="m in monitors" :key="m.id" class="border-b border-hairline pb-3 last:border-0 last:pb-0" :class="m.state === 'paused' && 'opacity-70'">
            <div class="flex items-center gap-2">
              <p class="min-w-0 flex-1 truncate text-[13.5px] font-medium" :title="m.label">{{ m.label }}</p>
              <span v-if="!project && projectOf(m, suites.list)" class="max-w-[8rem] shrink-0 truncate rounded-full border border-hairline px-2 py-0.5 text-[11.5px] text-ink-3"
                    :title="`Belongs to ${projectOf(m, suites.list).name}`">{{ projectOf(m, suites.list).name }}</span>
              <span v-if="m.onPage === false" class="shrink-0 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11.5px] text-warn">not on this page</span>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium" :class="stateTone(m.state)">{{ m.state }}</span>
            </div>
            <p class="mt-1 truncate font-mono text-[11.5px] text-ink-3" :title="m.selector">{{ m.selector }}</p>
            <p class="mt-1 text-[12.5px] italic text-ink-2">“{{ m.ruleText }}”</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="c in specChips(m)" :key="c.text" class="rounded-full border px-2 py-0.5 text-[11.5px]" :class="chipTone(c.tone)" :title="c.title">{{ c.text }}</span>
            </div>
            <p class="mt-2 font-mono text-[11.5px] text-ink-3">{{ metricsLine(m.metrics) }}</p>
            <p class="mt-1 text-[11.5px] text-ink-3">
              created {{ when(m.createdAt) }}<template v-if="m.lastTickAt"> · checked {{ when(m.lastTickAt) }}</template>
              · {{ m.stats?.incidents ?? 0 }} incident{{ (m.stats?.incidents ?? 0) === 1 ? '' : 's' }}
            </p>
            <div class="mt-2 flex items-center gap-2">
              <Btn size="sm" variant="ghost" :busy="pending === m.id" @click="m.state === 'paused' ? resume(m) : pause(m)">
                {{ m.state === 'paused' ? 'Resume' : 'Pause' }}
              </Btn>
              <Btn size="sm" variant="danger" :disabled="pending === m.id" @click="remove(m)">Delete</Btn>
              <span v-if="rowError && rowError.id === m.id" class="text-[12.5px] text-critical">{{ rowError.msg }}</span>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>

  <p v-if="error" class="mx-6 mb-6 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">
    {{ error }}
  </p>
</template>
