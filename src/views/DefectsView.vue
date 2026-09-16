<script setup>
/**
 * Defects: every distinct failure, numbered, searchable, triaged.
 *
 * Run history answers "what happened"; this answers "what is broken". The
 * runner files every defect itself — a failure it has not seen before gets the
 * next number, a pass closes it, a failure after that reopens it — so there is
 * no "report a bug" here: the reporter is always the application. What a
 * person does is find a defect and triage it.
 *
 * Finding is most of the page, and all of it lives in the URL: a filtered view
 * ("critical, unassigned, seen this week") is a link to paste into a ticket or
 * a stand-up, and /defects/DEF-2609-007 opens that defect over the list it was
 * opened from. A number typed into the search, however it is typed, finds that
 * defect whatever the filters say.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { useSession } from '@/stores/session';
import TopBar from '@/components/TopBar.vue';
import HeroPanel from '@/components/HeroPanel.vue';
import StatTile from '@/components/StatTile.vue';
import EmptyState from '@/components/EmptyState.vue';
import DefectStatus from '@/components/DefectStatus.vue';
import SeverityMark from '@/components/SeverityMark.vue';
import PersonMark from '@/components/PersonMark.vue';
import DefectDrawer from '@/components/DefectDrawer.vue';
import {
  SEEN, SEVERITIES, SEVERITY_ORDER, VIEWS,
  applyFilters, assigneesIn, canonicalId, countViews, filtersFrom, queryFrom, sortDefects, suitesIn, whereOf,
} from '@/defects';

const props = defineProps({ id: { type: String, default: null } });

const route = useRoute();
const router = useRouter();
const live = useLive();
const session = useSession();

const data = ref(null);
const loading = ref(true);
const failed = ref('');

async function load() {
  try {
    data.value = await api.defects();
    failed.value = '';
  } catch (e) {
    failed.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
// A run that has just ended may have filed, closed or reopened something.
watch(() => live.running, (now, before) => { if (before && !now) load(); });

/** The organisation's members, to assign to. None without a control plane, where a name is typed instead. */
const members = ref([]);
onMounted(async () => {
  if (session.required && session.manages) members.value = await session.members().catch(() => []);
});

const list = computed(() => data.value?.defects ?? []);
const filters = computed(() => filtersFrom(route.query));
const rows = computed(() => sortDefects(applyFilters(list.value, filters.value, { me: session.user }), filters.value.sort));
const counts = computed(() => countViews(list.value));
const suites = computed(() => suitesIn(list.value));
const assignees = computed(() => assigneesIn(list.value));
const lookup = computed(() => canonicalId(filters.value.q));
const narrowed = computed(() => ['q', 'severity', 'assignee', 'suite', 'seen'].some((k) => filters.value[k]));
const openId = computed(() => canonicalId(props.id) ?? props.id);

const totals = computed(() => {
  const open = list.value.filter((d) => d.status === 'open' || d.status === 'reopened');
  return {
    open: open.length,
    critical: open.filter((d) => d.severity === 'critical').length,
    unassigned: open.filter((d) => !d.assignee).length,
    closed: list.value.filter((d) => d.status === 'closed').length,
  };
});

// What a number looks like this month, for the sentence that explains them.
const now = new Date();
const example = `DEF-${String(now.getUTCFullYear() % 100).padStart(2, '0')}${String(now.getUTCMonth() + 1).padStart(2, '0')}-007`;
const exampleMonth = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Filters change by changing the URL. Replace, not push: Back should leave the
 * page, not undo one keystroke at a time.
 */
function set(patch) {
  router.replace({ path: route.path, query: queryFrom({ ...filters.value, ...patch }) });
}

// The search box runs ahead of the URL, which catches up a moment later.
const search = ref(filters.value.q);
let typing = null;
watch(search, (q) => {
  clearTimeout(typing);
  typing = setTimeout(() => { if (q !== filters.value.q) set({ q }); }, 180);
});
watch(() => filters.value.q, (q) => { if (q !== search.value) search.value = q; });
onBeforeUnmount(() => clearTimeout(typing));

function clear() {
  search.value = '';
  set({ q: '', severity: '', assignee: '', suite: '', seen: '' });
}

const open = (id) => router.push({ path: `/defects/${id}`, query: route.query });
const close = () => router.push({ path: '/defects', query: route.query });

/** Enter opens a defect: the one a typed number names, or the only one left. */
function enter() {
  const id = canonicalId(search.value);
  const hit = (id && list.value.find((d) => d.id === id)) || (rows.value.length === 1 ? rows.value[0] : null);
  if (hit) open(hit.id);
}

/** A triage saved in the sheet, put into the list without reading the whole list again. */
function changed(defect) {
  if (!data.value) return;
  data.value = { ...data.value, defects: data.value.defects.map((d) => (d.id === defect.id ? { ...d, ...defect } : d)) };
}

const COLUMNS = [
  { key: 'id', label: 'ID', sort: 'id' },
  { key: 'defect', label: 'Defect' },
  { key: 'reporter', label: 'Reporter' },
  { key: 'created', label: 'Created', sort: 'created' },
  { key: 'seen', label: 'Last seen', sort: 'seen' },
  { key: 'status', label: 'Status', sort: 'status', center: true },
  { key: 'severity', label: 'Severity', sort: 'severity' },
  { key: 'assignee', label: 'Assignee' },
];
const sortOf = (key) => (filters.value.sort === key ? 'ascending' : filters.value.sort === `-${key}` ? 'descending' : 'none');
// A column's first press puts the largest first: the newest, the worst, the most recent.
const sortBy = (key) => set({ sort: filters.value.sort === `-${key}` ? key : `-${key}` });

/** Each view's colour is the fill its statuses have in the column, so the views double as the legend. */
const VIEW_DOT = { open: 'bg-status-open', reopened: 'bg-status-reopened', parked: 'bg-status-known', closed: 'bg-status-closed' };

const SELECT = 'rounded-full border border-hairline bg-panel py-1.5 pl-3 pr-2 text-[13px] text-ink-2 outline-none hover:border-ink/25 focus:border-ink/25';

const when = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const day = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const full = (t) => new Date(t).toLocaleString();
</script>

<template>
  <TopBar :crumbs="id ? [{ label: 'Defects', to: { path: '/defects', query: route.query } }, { label: openId }] : [{ label: 'Defects' }]">
    <template #actions>
      <button class="rounded-full border border-hairline px-3.5 py-1.5 text-[13px] hover:border-ink/25" @click="load">Refresh</button>
    </template>
  </TopBar>

  <div class="mx-auto max-w-7xl px-6 py-8">
    <HeroPanel seed="defects">
      <p class="eyebrow">Defects</p>
      <h1 class="display mt-2 max-w-2xl text-4xl">What is actually broken.</h1>
      <p class="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-2">
        ghostclick files every distinct failure itself and gives it a number:
        <span class="font-mono text-[13px] text-ink">{{ example }}</span> is the seventh first seen in {{ exampleMonth }}.
        It closes when an affected case passes and reopens under the same number if it comes back.
        Owners and admins triage.
      </p>
    </HeroPanel>

    <p v-if="failed" class="mb-4 rounded-lg bg-critical/10 px-3 py-2 text-[13px] text-critical">{{ failed }}</p>

    <p v-if="loading" class="text-[13.5px] text-ink-3">Reading defects…</p>

    <EmptyState v-else-if="data && !list.length" title="Nothing has failed yet"
                body="ghostclick files a defect the first time a run fails in a way it has not seen before. Run a suite, and anything that breaks is numbered here.">
      <RouterLink to="/suites" class="rounded-full bg-brand px-4 py-2 text-[13.5px] font-medium text-white hover:bg-brand-deep">
        Go to your suites
      </RouterLink>
    </EmptyState>

    <template v-else-if="data">
      <div class="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open" :value="totals.open" note="failing now, not parked" dot="bg-status-open" />
        <StatTile label="Critical" :value="totals.critical" note="of the open ones" dot="bg-critical" />
        <StatTile label="Unassigned" :value="totals.unassigned" note="open, with nobody on it" dot="bg-status-known" />
        <StatTile label="Closed" :value="totals.closed" note="passing again" dot="bg-status-closed" />
      </div>

      <section class="card mb-3 space-y-3 p-3.5">
        <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Which defects">
          <button v-for="v in VIEWS" :key="v.key" type="button" :aria-pressed="filters.view === v.key"
                  class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px]"
                  :class="filters.view === v.key ? 'bg-brand-50 font-medium text-brand-2' : 'text-ink-2 hover:bg-ink/[0.04] hover:text-ink'"
                  @click="set({ view: v.key })">
            <span v-if="VIEW_DOT[v.key]" class="size-2 rounded-full" :class="VIEW_DOT[v.key]" aria-hidden="true" />
            {{ v.label }}
            <span class="tabular-nums" :class="filters.view === v.key ? 'text-brand-2/70' : 'text-ink-3'">{{ counts[v.key] }}</span>
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <label class="relative min-w-[16rem] flex-1">
            <span class="sr-only">Search defects</span>
            <svg viewBox="0 0 16 16" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" fill="none"
                 stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <path d="M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM10.8 10.8 14 14" />
            </svg>
            <input v-model="search" type="search" :placeholder="`Search ${example}, an error, a case, a suite or a person`"
                   class="w-full rounded-full border border-hairline bg-panel py-1.5 pl-9 pr-3 text-[13px] outline-none focus:border-ink/25"
                   @keydown.enter.prevent="enter">
          </label>
          <select :value="filters.severity" aria-label="Severity" :class="SELECT" @change="set({ severity: $event.target.value })">
            <option value="">Any severity</option>
            <option v-for="s in SEVERITY_ORDER" :key="s" :value="s">{{ SEVERITIES[s] }}</option>
          </select>
          <select :value="filters.assignee" aria-label="Assignee" :class="SELECT" @change="set({ assignee: $event.target.value })">
            <option value="">Anyone</option>
            <option v-if="session.user" value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            <option v-for="a in assignees" :key="a.key" :value="a.key">{{ a.label }}</option>
          </select>
          <select :value="filters.suite" aria-label="Suite" :class="SELECT" @change="set({ suite: $event.target.value })">
            <option value="">Every suite</option>
            <option v-for="s in suites" :key="s.key" :value="s.key">{{ s.name }}</option>
          </select>
          <select :value="filters.seen" aria-label="Last seen" :class="SELECT" @change="set({ seen: $event.target.value })">
            <option value="">Seen any time</option>
            <option v-for="(s, key) in SEEN" :key="key" :value="key">{{ s.label }}</option>
          </select>
          <button v-if="narrowed" type="button" class="rounded-full px-2.5 py-1.5 text-[12.5px] text-ink-3 hover:bg-ink/[0.04] hover:text-ink"
                  @click="clear">Clear</button>
        </div>
      </section>

      <p class="mb-2 px-1 text-[12.5px] text-ink-3" aria-live="polite">
        <template v-if="lookup">{{ rows.length ? `${lookup}, whatever the view and filters say — Enter opens it` : `No ${lookup} here` }}</template>
        <template v-else>{{ rows.length }} of {{ list.length }} defect{{ list.length === 1 ? '' : 's' }}</template>
      </p>

      <EmptyState v-if="!rows.length" :title="lookup ? `No ${lookup}` : 'No defects match'"
                  :body="lookup ? 'That number was never given out in this organisation, or it closed long enough ago to be forgotten.' : 'Nothing in this view matches the search and filters.'">
        <button v-if="narrowed" type="button" class="rounded-full border border-hairline bg-panel px-4 py-2 text-[13.5px] hover:border-ink/25"
                @click="clear">Clear the filters</button>
      </EmptyState>

      <section v-else class="card overflow-hidden">
        <div class="overflow-x-auto">
          <!-- A floor for a narrow window to scroll at, below what the columns
               need: at 980 it was the floor, not the columns, that pushed the
               table past a 1280px screen. -->
          <table class="w-full min-w-[900px] text-[13.5px]">
            <thead class="border-b border-hairline text-left">
              <tr class="table-head">
                <th v-for="c in COLUMNS" :key="c.key" scope="col" :aria-sort="c.sort ? sortOf(c.sort) : undefined"
                    class="whitespace-nowrap px-3 py-2.5 font-semibold first:pl-5 last:pr-5" :class="c.center && 'text-center'">
                  <button v-if="c.sort" type="button" class="inline-flex items-center gap-1 hover:text-ink" @click="sortBy(c.sort)">
                    {{ c.label }}
                    <svg viewBox="0 0 16 16" class="size-3" :class="sortOf(c.sort) === 'none' && 'opacity-0'" fill="none"
                         stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path :d="sortOf(c.sort) === 'ascending' ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'" />
                    </svg>
                  </button>
                  <template v-else>{{ c.label }}</template>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-hairline">
              <tr v-for="d in rows" :key="d.id" class="cursor-pointer align-middle hover:bg-ink/[0.02]"
                  :class="d.id === openId && 'bg-brand-50/60'" @click="open(d.id)">
                <td class="whitespace-nowrap py-3 pl-5 pr-3">
                  <RouterLink :to="{ path: `/defects/${d.id}`, query: route.query }"
                              class="font-mono text-[12.5px] font-semibold text-ink hover:text-brand-2" @click.stop>{{ d.id }}</RouterLink>
                </td>
                <!-- The one column that gives way. `w-0 min-w-full` keeps the
                     truncated line's full length out of the column's minimum;
                     without it a long case name pushes Assignee off the card at
                     laptop widths. -->
                <td class="min-w-[9rem] px-3 py-3">
                  <p class="line-clamp-2 font-mono text-[12.5px] leading-relaxed text-ink" :title="d.title">{{ d.title }}</p>
                  <p class="mt-1 w-0 min-w-full truncate text-[12px] text-ink-3" :title="[d.target, whereOf(d)].filter(Boolean).join(' · ')">
                    <span v-if="d.target" class="font-mono text-ink-2">{{ d.target }}</span><template v-if="d.target"> · </template>{{ whereOf(d) }}
                  </p>
                </td>
                <td class="whitespace-nowrap px-3 py-3 text-ink-2">
                  <span class="inline-flex items-center gap-2" title="Filed automatically when a run failed">
                    <span class="grid size-6 place-items-center rounded-full bg-ink"><span class="size-1.5 rounded-full bg-brand" /></span>
                    ghostclick
                  </span>
                </td>
                <td class="whitespace-nowrap px-3 py-3 tabular-nums text-ink-2" :title="full(d.firstSeen)">{{ day(d.firstSeen) }}</td>
                <td class="whitespace-nowrap px-3 py-3 text-ink-2" :title="full(d.lastSeen)">
                  {{ when(d.lastSeen) }}
                  <span class="block text-[12px] tabular-nums text-ink-3">{{ d.hits }} hit{{ d.hits === 1 ? '' : 's' }}</span>
                </td>
                <!-- The status fills its cell, the way a tracker's status column
                     is read down at a glance. `h-px` is what lets the fill take
                     the row's full height rather than its own. -->
                <td class="h-px w-28 p-0"><DefectStatus :status="d.status" cell /></td>
                <td class="whitespace-nowrap px-3 py-3"><SeverityMark :severity="d.severity" :auto="d.severityBy === 'ghostclick'" /></td>
                <td class="whitespace-nowrap py-3 pl-3 pr-5"><PersonMark :person="d.assignee" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>

  <DefectDrawer v-if="id" :id="id" :members="members" @close="close" @changed="changed" />
</template>
