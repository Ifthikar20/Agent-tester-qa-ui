<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '@/api';
import { useSuites } from '@/stores/suites';
import HeroPanel from '@/components/HeroPanel.vue';
import ProjectFilter from '@/components/ProjectFilter.vue';
import TopBar from '@/components/TopBar.vue';
import { runsSpec } from '@/charts';
import Chart from '@/components/Chart.vue';
import StatTile from '@/components/StatTile.vue';
import StatusPill from '@/components/StatusPill.vue';
import EmptyState from '@/components/EmptyState.vue';

const data = ref(null);
const filter = ref('');
const suites = useSuites();

/**
 * Which project, or all of them.
 *
 * Re-asked of the runner rather than filtered here, because `/api/runs` takes
 * a suite and does the slice itself (runs.js summary) — and the numbers above
 * the chart are computed from that slice, so filtering client-side would give
 * a pass rate for one project under a headline counting every project. One
 * source for the whole page, chosen by one control.
 */
const project = ref(null);
const loading = ref(true);
async function load() {
  loading.value = true;
  try { data.value = await api.runs(project.value ?? undefined); }
  finally { loading.value = false; }
}
onMounted(async () => {
  await load();
  // The chips need the projects and their marks; the store is already the
  // sidebar's source for both.
  if (!suites.list.length) suites.loadList().catch(() => null);
});
watch(project, load);

/** How many of the last fortnight's runs each project has, for the chips. */
const perProject = computed(() => {
  const by = {};
  for (const s of data.value?.suites ?? []) if (s.suiteId) by[s.suiteId] = (by[s.suiteId] ?? 0) + s.runs;
  return by;
});

const when = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const dur = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const match = (rows) => rows.filter((r) => (r.suite ?? '').toLowerCase().includes(filter.value.toLowerCase()));
</script>

<template>
  <TopBar :crumbs="[{ label: 'Run history' }]" />

  <div class="mx-auto max-w-6xl px-6 py-8">
    <HeroPanel seed="dashboard">
      <p class="eyebrow">Run history</p>
      <h1 class="mt-1.5 display text-4xl">Every run, and what broke.</h1>
      <p class="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
        Each case that finishes is recorded here — which suite, how long it took, and the step it
        stopped on.
      </p>
    </HeroPanel>

    <!-- Which project, above everything it changes. The numbers, the chart and
         the table are all one slice of the history, so the control that picks
         the slice belongs over all three rather than beside the table. -->
    <ProjectFilter v-if="suites.list.length > 1" v-model="project" :projects="suites.list" :counts="perProject" class="mt-6" />

    <EmptyState v-if="data && !data.totals.runs && !project" title="No runs yet"
                body="Onboard a suite and run it; the outcomes land here.">
      <RouterLink to="/suites/new" class="rounded-full bg-brand px-4 py-2 text-[13.5px] font-medium text-white hover:bg-brand-deep">
        Onboard a project
      </RouterLink>
    </EmptyState>

    <!-- A project picked, and nothing of it in the window. Not the same as
         having no runs at all, so it does not say so — and it offers the way
         back rather than leaving somebody on an empty page. -->
    <EmptyState v-else-if="data && !data.totals.runs" title="No runs for this project in the last fortnight"
                body="Other projects have runs in this window. Run one of this project's tests, or look at everything.">
      <button type="button" class="rounded-full border border-hairline px-4 py-2 text-[13.5px] hover:border-ink/25"
              @click="project = null">Show every project</button>
    </EmptyState>

    <template v-else-if="data">
      <div class="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Runs, 7 days" :value="data.totals.week" :note="`${data.totals.runs} recorded in total`" />
        <StatTile label="Passing" :value="data.totals.passRate === null ? '—' : `${Math.round(data.totals.passRate * 100)}%`"
                  note="of runs in the last 7 days" />
        <StatTile label="Suites" :value="data.totals.suites" note="distinct scripts" />
        <StatTile label="Median run" :value="data.totals.medianMs === null ? '—' : dur(data.totals.medianMs)"
                  note="across the last 7 days" />
      </div>

      <div class="mb-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section class="card min-w-0 p-5">
          <div class="flex items-baseline gap-3">
            <h2 class="text-[15px] font-medium">Runs per day</h2>
            <span class="text-[13px] text-ink-3">The last fourteen days.</span>
            <span class="ml-auto flex items-center gap-4 text-[12.5px] text-ink-2">
              <span class="flex items-center gap-1.5"><i class="size-2.5 rounded-[3px] bg-pass" /> Passed</span>
              <span class="flex items-center gap-1.5"><i class="size-2.5 rounded-[3px] bg-fail" /> Failed</span>
            </span>
          </div>
          <Chart :spec="runsSpec(data.days)" class="mt-3" :height="240" :legend="false" />
        </section>

        <section class="card min-w-0 wash-warm p-5">
          <h2 class="text-[15px] font-medium">Passing</h2>
          <p class="mt-1 text-[13px] text-ink-2">Share of runs that finished clean.</p>
          <p class="mt-5 display text-5xl tabular-nums">
            {{ data.totals.passRate === null ? '—' : `${Math.round(data.totals.passRate * 100)}%` }}
          </p>
          <div class="mt-5 h-2.5 overflow-hidden rounded-full bg-hairline">
            <div class="h-full rounded-full bg-ink transition-[width] duration-500"
                 :style="{ width: `${(data.totals.passRate ?? 0) * 100}%` }" />
          </div>
          <ul class="mt-4 space-y-1.5 text-[13px]">
            <li class="flex items-center gap-2"><i class="size-2.5 rounded-[3px] bg-pass" />
              {{ data.days.reduce((n, d) => n + d.passed, 0) }} passed</li>
            <li class="flex items-center gap-2"><i class="size-2.5 rounded-[3px] bg-fail" />
              {{ data.days.reduce((n, d) => n + d.failed, 0) }} failed</li>
          </ul>
        </section>
      </div>

      <section class="card mb-5 overflow-hidden">
        <!-- The filter lives with the tables it narrows, not in the top bar:
             it is this report's control, and the bar is for what every page
             shares. It narrows the Latest table below as well. -->
        <div class="flex flex-wrap items-center gap-3 px-5 pt-5">
          <h2 class="text-[15px] font-medium">By suite</h2>
          <span class="text-[13px] text-ink-3">Newest first.</span>
          <input v-model="filter" placeholder="Filter suites" aria-label="Filter suites"
                 class="ml-auto w-52 rounded-full border border-hairline bg-panel px-3.5 py-1 text-[12.5px] outline-none focus:border-ink/25">
        </div>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-[13.5px]">
            <thead class="border-y border-hairline text-left">
              <tr class="table-head">
                <th class="px-5 py-2.5 font-semibold">Suite</th>
                <th class="px-3 py-2.5 font-semibold">Last run</th>
                <th class="px-3 py-2.5 font-semibold">Pass rate</th>
                <th class="px-5 py-2.5 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-hairline">
              <tr v-for="s in match(data.suites)" :key="s.suite">
                <td class="px-5 py-3">
                  <RouterLink v-if="s.suiteId" :to="`/suites/${s.suiteId}`" class="hover:underline">{{ s.suite }}</RouterLink>
                  <span v-else>{{ s.suite }}</span>
                </td>
                <td class="px-3 py-3 text-ink-2">{{ when(s.last.at) }}</td>
                <td class="px-3 py-3 tabular-nums text-ink-2">{{ Math.round(s.passed / s.runs * 100) }}% of {{ s.runs }}</td>
                <td class="px-5 py-3 text-right"><StatusPill :ok="s.last.ok" size="sm" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card overflow-hidden">
        <div class="flex items-baseline gap-3 px-5 pt-5">
          <h2 class="text-[15px] font-medium">Latest</h2>
        </div>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-[13.5px]">
            <thead class="border-y border-hairline text-left">
              <tr class="table-head">
                <th class="px-5 py-2.5 font-semibold">Suite</th>
                <th class="px-3 py-2.5 font-semibold">Steps</th>
                <th class="px-3 py-2.5 font-semibold">Took</th>
                <th class="px-5 py-2.5 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-hairline">
              <tr v-for="r in match(data.latest)" :key="r.at">
                <td class="px-5 py-3">
                  <p>{{ r.suite }}</p>
                  <p class="mt-0.5 text-[12px] text-ink-3">
                    {{ when(r.at) }}<template v-if="r.defect"> · <RouterLink :to="`/defects/${r.defect}`" class="font-mono text-brand-2 hover:underline" :title="`Filed as ${r.defect} — open it`">{{ r.defect }}</RouterLink></template><template v-if="r.error"> · {{ r.error }}</template>
                  </p>
                </td>
                <td class="px-3 py-3 tabular-nums text-ink-2">
                  {{ r.ok ? r.total : `${r.passed} of ${r.total}, stopped at ${r.step + 1}` }}
                </td>
                <td class="px-3 py-3 tabular-nums text-ink-2">{{ dur(r.ms) }}</td>
                <td class="px-5 py-3 text-right"><StatusPill :ok="r.ok" size="sm" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
