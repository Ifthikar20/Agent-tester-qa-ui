<script setup>
/**
 * Defects: what is broken, numbered, in one list — whichever way the runner
 * found out.
 *
 * Run history answers "what happened"; this answers "what is broken". The
 * runner files a defect for every distinct failure a run stops on and for
 * every rule a monitor confirms broken (its defects.js), closes it when the
 * case passes again or the page recovers, and reopens it under the same
 * number when it comes back. People triage: assign it, overrule the
 * severity, park it as a known issue or won't-fix. Nothing here is hand-kept.
 *
 * The page is laid out the way a good issue tracker is: the numbers that
 * matter first, one-press filters, a dense list where each row is the
 * number, the sentence, where and how often, and a drawer beside the list
 * for the whole story of one defect — its evidence, its activity, its
 * triage — reachable by its own address (/defects/DEF-2609-007), so a
 * number in a chat reply or a notification opens straight onto it.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import {
  SEVERITIES, SORTS, SOURCES, STATUS_FILTERS, assigneeName, initialsOf, selectRows, severityLook, sourceOf, statusPill,
  subtitleOf, tilesOf, whereOf,
} from '@/defects';
import { when } from '@/time';
import TopBar from '@/components/TopBar.vue';
import HeroPanel from '@/components/HeroPanel.vue';
import StatTile from '@/components/StatTile.vue';
import EmptyState from '@/components/EmptyState.vue';
import Icon from '@/components/Icon.vue';
import DefectDrawer from '@/components/DefectDrawer.vue';

const route = useRoute();
const router = useRouter();
const live = useLive();

const data = ref(null);            // { defects, totals } from the runner
const loading = ref(true);
const error = ref(null);
const q = ref('');
const status = ref('standing');
const source = ref('all');
const severities = ref([]);        // none chosen means every severity
const sort = ref('recent');

async function load(quiet = false) {
  if (!quiet) loading.value = true;
  error.value = null;
  try { data.value = await api.defects(); } catch (e) { if (!quiet) error.value = e.message; }
  finally { loading.value = false; }
}
onMounted(load);
// The runner says when a run or an incident filed, closed or reopened one (defects.changed): the list follows.
watch(() => live.defectsVersion, () => load(true));
watch(() => live.connected, (c) => { if (c) load(true); });

const list = computed(() => data.value?.defects ?? []);
const tiles = computed(() => tilesOf(list.value, data.value?.totals));
const rows = computed(() => selectRows(list.value, { status: status.value, source: source.value, severities: severities.value, q: q.value, sort: sort.value }));
/** How many each status filter would show, so a pill says what is behind it. */
const countFor = (key) => selectRows(list.value, { status: key, source: source.value, severities: severities.value, q: q.value }).length;
const filtered = computed(() => q.value.trim() || source.value !== 'all' || severities.value.length > 0);
function toggleSeverity(s) {
  severities.value = severities.value.includes(s) ? severities.value.filter((x) => x !== s) : [...severities.value, s];
}
function clearFilters() { q.value = ''; source.value = 'all'; severities.value = []; }

// ------------------------------------------------------------ the drawer
// The open defect is the address, so a number pasted from a chat reply or a
// notification lands on it, and closing is going back to the list.
const selectedId = computed(() => (route.params.id ? String(route.params.id) : null));
const open = (d) => router.push({ name: 'defects', params: { id: d.id } });
const close = () => { if (selectedId.value) router.push({ name: 'defects' }); };
/** The drawer's copy of a defect after a triage, folded back into the row. */
function changed(defect) {
  if (!data.value) return;
  const i = data.value.defects.findIndex((d) => d.id === defect.id);
  if (i >= 0) data.value.defects.splice(i, 1, defect);
}
const onKey = (e) => { if (e.key === 'Escape' && selectedId.value) close(); };
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

const emptyTitle = computed(() => {
  if (filtered.value) return 'Nothing matches';
  return { standing: 'Nothing is failing', parked: 'Nothing is parked', closed: 'Nothing has been closed yet', all: 'Nothing has failed yet' }[status.value];
});
const emptyBody = computed(() => (filtered.value
  ? 'Loosen the search or the filters — the runner keeps every defect it has filed.'
  : 'Defects are filed by the runner: every failure a run stops on, and every rule a monitor confirms broken, under a number nobody else will get. Run a suite or watch a page and anything that breaks collects here.'));
</script>

<template>
  <TopBar :crumbs="[{ label: 'Defects' }]">
    <template #actions>
      <button type="button" class="whitespace-nowrap rounded-full border border-hairline px-3.5 py-1.5 text-[13px] hover:border-ink/25"
              @click="load()">Refresh</button>
    </template>
  </TopBar>

  <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
    <HeroPanel seed="defects">
      <p class="eyebrow">Defects</p>
      <h1 class="display mt-2 max-w-2xl text-3xl sm:text-4xl">What is actually broken.</h1>
      <p class="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-2">
        One numbered defect per distinct failure — a case that stops, a monitored page that breaks
        its rule — closed by itself when it passes again, reopened under the same number when it
        comes back. People triage; the runner files.
      </p>
    </HeroPanel>

    <p v-if="error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ error }}</p>

    <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-defect-tiles>
      <StatTile label="Open" :value="tiles.open" :note="tiles.unassigned ? `${tiles.unassigned} unassigned` : 'all assigned'" />
      <StatTile label="Needs attention" :value="tiles.urgent" :note="tiles.critical ? `${tiles.critical} critical` : 'critical and major, open'" />
      <StatTile label="From monitors" :value="tiles.monitors" note="rules broken on watched pages" />
      <StatTile label="Closed, 7 days" :value="tiles.closedWeek" :note="`${tiles.newWeek} filed this week`" />
    </div>

    <section class="card overflow-hidden">
      <!-- The controls: a search, the status in one press, the source, the
           severities, the order. They narrow the one list, and the pills say
           how many are behind each so a filter is never a guess. -->
      <div class="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3 sm:px-5" data-defect-filters>
        <label class="relative min-w-0 grow basis-52">
          <span class="sr-only">Search defects</span>
          <input v-model="q" type="search" spellcheck="false" placeholder="Search by number, sentence, suite, case, monitor…"
                 class="w-full rounded-full border border-hairline bg-panel py-1.5 pl-9 pr-3.5 text-[13px] outline-none focus:border-ink/25">
          <svg viewBox="0 0 16 16" class="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.2" /><path d="m10.3 10.3 3.2 3.2" />
          </svg>
        </label>
        <div class="flex items-center gap-1 rounded-full border border-hairline p-0.5" role="tablist" aria-label="Status">
          <button v-for="f in STATUS_FILTERS" :key="f.key" type="button" role="tab" :aria-selected="status === f.key" :title="f.title"
                  class="rounded-full px-3 py-1 text-[12.5px] transition"
                  :class="status === f.key ? 'bg-brand-50 font-medium text-brand-2' : 'text-ink-2 hover:text-ink'"
                  @click="status = f.key">
            {{ f.label }} <span class="tabular-nums text-ink-3">{{ countFor(f.key) }}</span>
          </button>
        </div>
        <select v-model="source" aria-label="Source" class="rounded-full border border-hairline bg-panel px-3 py-1.5 text-[12.5px] outline-none focus:border-ink/25">
          <option v-for="s in SOURCES" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
        <div class="flex items-center gap-1" aria-label="Severity">
          <button v-for="s in SEVERITIES" :key="s" type="button" :aria-pressed="severities.includes(s)"
                  class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition"
                  :class="severities.includes(s) ? 'border-ink/30 bg-ink/[0.04] text-ink' : 'border-hairline text-ink-2 hover:border-ink/25'"
                  @click="toggleSeverity(s)">
            <i class="size-2 rounded-[2px]" :class="severityLook(s).swatch" />{{ s }}
          </button>
        </div>
        <select v-model="sort" aria-label="Sort" class="ml-auto rounded-full border border-hairline bg-panel px-3 py-1.5 text-[12.5px] outline-none focus:border-ink/25">
          <option v-for="s in SORTS" :key="s.key" :value="s.key">by {{ s.label.toLowerCase() }}</option>
        </select>
        <button v-if="filtered" type="button" class="text-[12.5px] text-ink-3 underline underline-offset-2 hover:text-ink" @click="clearFilters">Clear</button>
      </div>

      <p v-if="loading" class="px-5 py-8 text-center text-[13.5px] text-ink-3">Reading the runner’s defects…</p>

      <div v-else-if="!rows.length" class="p-4 sm:p-5">
        <EmptyState :title="emptyTitle" :body="emptyBody">
          <button v-if="filtered" type="button" class="rounded-full border border-hairline px-4 py-2 text-[13.5px] hover:border-ink/25" @click="clearFilters">Clear the filters</button>
          <RouterLink v-else-if="status === 'standing'" to="/suites" class="rounded-full bg-brand px-4 py-2 text-[13.5px] font-medium text-white hover:bg-brand-deep">Go to your suites</RouterLink>
        </EmptyState>
      </div>

      <template v-else>
        <!-- One line of column names on a wide screen; the rows carry their own labels on a narrow one. -->
        <div class="table-head hidden grid-cols-[6.75rem_minmax(0,1fr)_6.5rem_5.25rem_3.25rem_6rem_2.25rem] items-center gap-x-4 border-b border-hairline px-5 py-2 md:grid" aria-hidden="true">
          <span>Severity</span><span>Defect</span><span>Source</span><span>Status</span><span class="text-right">Hits</span><span>Last seen</span><span />
        </div>
        <ul class="divide-y divide-hairline" data-defect-rows>
          <li v-for="d in rows" :key="d.id">
            <button type="button"
                    class="grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-3 text-left transition hover:bg-ink/[0.025] md:grid-cols-[6.75rem_minmax(0,1fr)_6.5rem_5.25rem_3.25rem_6rem_2.25rem] md:items-center md:gap-x-4 md:px-5 md:py-2.5"
                    :class="selectedId === d.id && 'bg-brand-50/60'"
                    :aria-current="selectedId === d.id ? 'true' : undefined"
                    @click="open(d)">
              <span class="inline-flex items-center gap-1.5 pt-0.5 text-[12px] font-medium md:pt-0" :class="severityLook(d.severity).text" :title="d.severityBy === 'person' ? 'Severity set by a person' : 'Severity worked out by the runner'">
                <i class="size-2 shrink-0 rounded-[2px]" :class="severityLook(d.severity).swatch" />
                <span class="hidden md:inline">{{ severityLook(d.severity).label }}</span>
              </span>
              <span class="min-w-0">
                <span class="flex min-w-0 items-baseline gap-2">
                  <span class="shrink-0 font-mono text-[11.5px] text-ink-3">{{ d.id }}</span>
                  <span class="min-w-0 truncate text-[13.5px] font-medium text-ink" :title="d.title">{{ d.title }}</span>
                </span>
                <span class="mt-0.5 block truncate text-[12px] text-ink-3" :title="`${whereOf(d)}${subtitleOf(d) ? ' · ' + subtitleOf(d) : ''}`">
                  {{ whereOf(d) }}<template v-if="subtitleOf(d)"> · {{ subtitleOf(d) }}</template>
                </span>
                <!-- On a narrow screen the row's numbers sit under its sentence. -->
                <span class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3 md:hidden">
                  <span class="rounded-full px-2 py-0.5 font-medium" :class="statusPill(d.status).tone">{{ statusPill(d.status).label }}</span>
                  <span class="inline-flex items-center gap-1"><Icon :name="sourceOf(d).icon" class="size-3" />{{ sourceOf(d).label }}</span>
                  <span>{{ d.hits }}×</span>
                  <span>{{ when(d.lastSeen) }}</span>
                  <span v-if="d.assignee">{{ assigneeName(d.assignee) }}</span>
                </span>
              </span>
              <span class="hidden items-center gap-1.5 text-[12px] text-ink-2 md:inline-flex" :title="sourceOf(d).title">
                <Icon :name="sourceOf(d).icon" class="size-3.5 text-ink-3" />{{ sourceOf(d).label }}
              </span>
              <span class="hidden md:block">
                <span class="rounded-full px-2 py-0.5 text-[11.5px] font-medium" :class="statusPill(d.status).tone">{{ statusPill(d.status).label }}</span>
              </span>
              <span class="hidden text-right text-[12.5px] tabular-nums text-ink-2 md:block" :title="`${d.hits} time${d.hits === 1 ? '' : 's'}${d.reopened ? `, reopened ${d.reopened}×` : ''}`">{{ d.hits }}×</span>
              <span class="hidden text-[12.5px] text-ink-2 md:block" :title="new Date(d.lastSeen).toLocaleString()">{{ when(d.lastSeen) }}</span>
              <span class="hidden md:block">
                <span v-if="d.assignee" class="inline-flex size-6 items-center justify-center rounded-full bg-brand-50 text-[10.5px] font-semibold text-brand-2" :title="`Assigned to ${assigneeName(d.assignee)}`">{{ initialsOf(d.assignee) }}</span>
                <span v-else class="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-hairline text-ink-3" title="Unassigned" aria-label="Unassigned">·</span>
              </span>
            </button>
          </li>
        </ul>
        <p class="border-t border-hairline px-5 py-2.5 text-[12px] text-ink-3">
          {{ rows.length }} of {{ list.length }} defect{{ list.length === 1 ? '' : 's' }} · the runner keeps closed ones for the plan’s retention
        </p>
      </template>
    </section>
  </div>

  <DefectDrawer v-if="selectedId" :id="selectedId" @close="close" @changed="changed" />
</template>
