<script setup>
/**
 * What a reply's tools read, drawn.
 *
 * The defect rows, the runs per day, a suite's pages and cases, the pages
 * scanned, the monitors, a chart asked for in words, a table somebody
 * attached — shaped by the tool that read them (chat-tools.js `view`) and
 * kept on the reply (chat.js `data`). Tiles for the numbers, the one chart
 * component every page uses (Chart.vue) for runs per day, defects by
 * severity and cases by suite, a table for rows: the same pieces the pages
 * use, so a figure here reads like the same figure there. The words above
 * are the mind's; every number here is the tool's, which is what lets a
 * person check the one against the other.
 */
import { computed } from 'vue';
import { when } from '@/time';
import { countsSpec, runsSpec } from '@/charts';
import Chart from '@/components/Chart.vue';
import StatusPill from '@/components/StatusPill.vue';

const props = defineProps({ view: { type: Object, required: true } });
const v = computed(() => props.view);

const dur = (ms) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const at = (t) => { if (!t) return 'never'; const n = typeof t === 'number' ? t : Date.parse(t); return Number.isFinite(n) ? when(n) : String(t); };
const cap = (s, n = 90) => (s == null ? '' : String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const sum = (rows, k) => (rows ?? []).reduce((a, r) => a + (Number(r[k]) || 0), 0);

const TITLE = { runs: 'Runs', defects: 'Defects', defect: 'Defect', suites: 'Suites', suite: 'Suite', pages: 'Pages scanned', monitoring: 'Monitoring', table: 'Table' };
const title = computed(() => {
  const x = v.value;
  if (x.kind === 'defect') return x.id;
  if (x.kind === 'suite') return x.name ?? 'Suite';
  if (x.kind === 'defects') return `Defects · ${x.status ?? 'open'}`;
  if (x.kind === 'chart') return x.title ?? 'Chart';
  if (x.kind === 'table') return x.name ?? 'Table';
  return TITLE[x.kind] ?? 'Data';
});
const note = computed(() => {
  const x = v.value;
  switch (x.kind) {
    case 'runs': return `${x.days?.length ?? 0} days`;
    case 'defects': return `${x.rows?.length ?? 0} listed`;
    case 'suite': return x.origin ? `${x.origin}${x.allowed === false ? ' · origin not allowed' : ''}` : '';
    case 'pages': return 'most recently scanned first';
    case 'chart': return x.subtitle ?? '';
    case 'table': return `${x.total ?? x.rows?.length ?? 0} row${(x.total ?? x.rows?.length) === 1 ? '' : 's'}${x.sheet ? ` · ${x.sheet}` : ''}${(x.total ?? 0) > (x.rows?.length ?? 0) ? `, the first ${x.rows.length} shown` : ''}`;
    default: return '';
  }
});

/** The tiles a view leads with. */
const tiles = computed(() => {
  const x = v.value;
  switch (x.kind) {
    case 'runs': return [
      { label: 'Runs', value: x.totals?.runs ?? 0 },
      { label: 'Passing', value: pct(x.totals?.passRate) },
      ...(x.totals?.week != null ? [{ label: '7 days', value: x.totals.week }] : []),
      ...(x.totals?.medianMs != null ? [{ label: 'Median run', value: dur(x.totals.medianMs) }] : []),
    ];
    case 'defects': return ['open', 'reopened', 'closed', 'all'].filter((k) => x.totals?.[k] != null).map((k) => ({ label: k, value: x.totals[k] }));
    case 'monitoring': return [{ label: 'Monitors', value: x.counts?.monitors ?? 0 }, { label: 'Open incidents', value: x.counts?.open ?? 0 }];
    case 'suites': return [{ label: 'Suites', value: x.rows?.length ?? 0 }, { label: 'Pages', value: sum(x.rows, 'pages') }, { label: 'Cases', value: sum(x.rows, 'cases') }];
    case 'suite': return [{ label: 'Pages', value: x.pages?.length ?? 0 }, { label: 'Cases', value: x.cases?.length ?? 0 }, { label: 'Steps', value: sum(x.cases, 'steps') }];
    case 'defect': return [{ label: 'Hits', value: x.hits ?? 0 }, { label: 'Cases', value: x.cases ?? 0 }, { label: 'First seen', value: at(x.firstSeen) }, { label: 'Last seen', value: at(x.lastSeen) }];
    default: return [];
  }
});

/**
 * The charts a view carries: runs per day for runs, the rows by severity
 * for defects (a status colour each), cases by suite when there is more
 * than one suite to compare — and a chart view is its own spec.
 */
const SEVERITY_ROLE = { high: 'critical', critical: 'critical', blocker: 'critical', major: 'warn', medium: 'warn' };
const SEVERITY_ORDER = ['critical', 'blocker', 'high', 'major', 'medium', 'low', 'minor', 'trivial', 'unrated'];
const chart = computed(() => {
  const x = v.value;
  if (x.kind === 'chart') return x;
  if (x.kind === 'runs') return x.days?.length ? runsSpec(x.days) : null;
  if (x.kind === 'defects' && x.rows?.length) {
    const by = new Map();
    for (const r of x.rows) { const k = String(r.severity ?? 'unrated').toLowerCase(); by.set(k, (by.get(k) ?? 0) + 1); }
    const rows = [...by].sort((a, b) => (SEVERITY_ORDER.indexOf(a[0]) + 1 || 99) - (SEVERITY_ORDER.indexOf(b[0]) + 1 || 99)).map(([name, value]) => ({ name, value }));
    // One severity is one bar, and that bar is a number the tiles already show.
    if (rows.length < 2) return null;
    return countsSpec('Defects by severity', rows, { horizontal: false, roles: (r) => SEVERITY_ROLE[r.name] ?? 'neutral' });
  }
  if (x.kind === 'suites' && (x.rows?.length ?? 0) > 1) return countsSpec('Cases by suite', x.rows.map((r) => ({ name: r.name, value: r.cases })), { value: 'value' });
  return null;
});
const statusTone = (s) => (s === 'open' ? 'bg-critical/10 text-critical' : s === 'reopened' ? 'bg-warn/10 text-warn' : 'bg-ink/5 text-ink-2');
</script>

<template>
  <div class="rounded-xl border border-hairline bg-panel px-4 py-3 text-[12.5px]" :data-view="view.kind">
    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span class="font-medium text-ink">{{ title }}</span>
      <span v-if="note" class="text-ink-3">{{ note }}</span>
      <span v-if="view.kind === 'defect'" class="ml-auto flex items-center gap-1.5">
        <span v-if="view.severity" class="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink-2">{{ view.severity }}</span>
        <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusTone(view.status)">{{ view.status }}</span>
      </span>
    </div>

    <!-- the numbers, as tiles -->
    <div v-if="tiles.length" class="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div v-for="t in tiles" :key="t.label" class="rounded-lg bg-ground px-3 py-2">
        <p class="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{{ t.label }}</p>
        <p class="mt-0.5 display text-xl tabular-nums">{{ t.value }}</p>
      </div>
    </div>

    <!-- the chart a view carries, drawn the way every page draws one -->
    <div v-if="chart" class="mt-3"><Chart :spec="chart" :height="view.kind === 'chart' ? 240 : 200" /></div>

    <!-- runs: the latest -->
    <template v-if="view.kind === 'runs'">
      <div v-if="view.latest?.length" class="mt-3 overflow-x-auto">
        <table class="w-full text-left">
          <thead class="table-head"><tr><th class="px-2 py-1.5 font-medium">When</th><th class="px-2 py-1.5 font-medium">Suite · case</th><th class="px-2 py-1.5 font-medium">Steps</th><th class="px-2 py-1.5 font-medium">Result</th><th class="px-2 py-1.5 font-medium">What stopped it</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in view.latest" :key="i" class="border-t border-hairline align-top">
              <td class="whitespace-nowrap px-2 py-1.5 text-ink-3">{{ at(r.at) }}</td>
              <td class="px-2 py-1.5"><span class="text-ink">{{ r.suite ?? '—' }}</span><span v-if="r.caseName" class="text-ink-2"> · {{ r.caseName }}</span></td>
              <td class="whitespace-nowrap px-2 py-1.5 tabular-nums text-ink-2">{{ r.passed }}/{{ r.total }}</td>
              <td class="px-2 py-1.5"><StatusPill :ok="r.ok" size="sm" /></td>
              <td class="px-2 py-1.5 text-ink-2">{{ cap(r.error, 80) }}<span v-if="r.defect" class="ml-1 text-brand-2">{{ r.defect }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- defects: the rows -->
    <template v-else-if="view.kind === 'defects'">
      <div v-if="view.rows?.length" class="mt-3 overflow-x-auto">
        <table class="w-full text-left">
          <thead class="table-head"><tr><th class="px-2 py-1.5 font-medium">Defect</th><th class="px-2 py-1.5 font-medium">Severity</th><th class="px-2 py-1.5 font-medium">Title</th><th class="px-2 py-1.5 font-medium">Cases</th><th class="px-2 py-1.5 font-medium">Hits</th><th class="px-2 py-1.5 font-medium">Last seen</th><th class="px-2 py-1.5 font-medium">Status</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in view.rows" :key="i" class="border-t border-hairline align-top">
              <td class="whitespace-nowrap px-2 py-1.5 font-medium text-ink">{{ r.id ?? '—' }}</td>
              <td class="px-2 py-1.5 text-ink-2">{{ r.severity ?? '—' }}</td>
              <td class="px-2 py-1.5 text-ink">{{ cap(r.title, 100) }}</td>
              <td class="px-2 py-1.5 tabular-nums text-ink-2">{{ r.cases }}</td>
              <td class="px-2 py-1.5 tabular-nums text-ink-2">{{ r.hits }}</td>
              <td class="whitespace-nowrap px-2 py-1.5 text-ink-3">{{ at(r.lastSeen) }}</td>
              <td class="px-2 py-1.5"><span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusTone(r.status)">{{ r.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="mt-2 text-ink-3">No {{ view.status ?? 'open' }} defects.</p>
    </template>

    <!-- one defect: what it is, and the runs that hit it -->
    <template v-else-if="view.kind === 'defect'">
      <p v-if="view.title" class="mt-2.5 text-[13px] text-ink">{{ view.title }}</p>
      <p v-if="view.target" class="mt-1 font-mono text-[11.5px] text-ink-2">{{ view.target }}</p>
      <p v-if="view.caseNames?.length" class="mt-2 text-ink-2"><span class="text-ink-3">Cases:</span> {{ view.caseNames.join(', ') }}<span v-if="view.suiteNames?.length" class="text-ink-3"> · in {{ view.suiteNames.join(', ') }}</span></p>
      <ul v-if="view.runs?.length" class="mt-2 space-y-0.5">
        <li v-for="(r, i) in view.runs" :key="i" class="flex items-baseline gap-2 text-ink-2"><span class="min-w-16 shrink-0 whitespace-nowrap text-ink-3">{{ at(r.at) }}</span><span class="min-w-0 [overflow-wrap:anywhere]">{{ r.caseName ?? 'a run' }}<span v-if="r.error" class="text-ink-3"> — {{ cap(r.error, 90) }}</span></span></li>
      </ul>
    </template>

    <!-- suites: one row each -->
    <div v-else-if="view.kind === 'suites'" class="mt-3 overflow-x-auto">
      <table v-if="view.rows?.length" class="w-full text-left">
        <thead class="table-head"><tr><th class="px-2 py-1.5 font-medium">Suite</th><th class="px-2 py-1.5 font-medium">Origin</th><th class="px-2 py-1.5 font-medium">Pages</th><th class="px-2 py-1.5 font-medium">Cases</th><th class="px-2 py-1.5 font-medium">Updated</th></tr></thead>
        <tbody>
          <tr v-for="r in view.rows" :key="r.id" class="border-t border-hairline">
            <td class="px-2 py-1.5 font-medium text-ink">{{ r.name }}</td>
            <td class="px-2 py-1.5 text-ink-2">{{ r.origin }}</td>
            <td class="px-2 py-1.5 tabular-nums text-ink-2">{{ r.pages }}</td>
            <td class="px-2 py-1.5 tabular-nums text-ink-2">{{ r.cases }}</td>
            <td class="whitespace-nowrap px-2 py-1.5 text-ink-3">{{ at(r.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="text-ink-3">No suites yet.</p>
    </div>

    <!-- one suite: its pages, then its cases -->
    <template v-else-if="view.kind === 'suite'">
      <div v-if="view.pages?.length" class="mt-3 overflow-x-auto">
        <table class="w-full text-left">
          <thead class="table-head"><tr><th class="px-2 py-1.5 font-medium">Page</th><th class="px-2 py-1.5 font-medium">Path</th><th class="px-2 py-1.5 font-medium">Expectations</th><th class="px-2 py-1.5 font-medium">Targets</th><th class="px-2 py-1.5 font-medium">Scanned</th></tr></thead>
          <tbody>
            <tr v-for="p in view.pages" :key="p.id" class="border-t border-hairline">
              <td class="px-2 py-1.5 font-medium text-ink">{{ p.name }}</td>
              <td class="px-2 py-1.5 font-mono text-[11.5px] text-ink-2">{{ p.path }}</td>
              <td class="px-2 py-1.5 tabular-nums text-ink-2">{{ p.expect }}</td>
              <td class="px-2 py-1.5 tabular-nums text-ink-2">{{ p.targets }}</td>
              <td class="whitespace-nowrap px-2 py-1.5 text-ink-3">{{ at(p.scannedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="view.cases?.length" class="mt-3 overflow-x-auto">
        <table class="w-full text-left">
          <thead class="table-head"><tr><th class="px-2 py-1.5 font-medium">Case</th><th class="px-2 py-1.5 font-medium">Page</th><th class="px-2 py-1.5 font-medium">Steps</th><th class="px-2 py-1.5 font-medium">Source</th></tr></thead>
          <tbody>
            <tr v-for="c in view.cases" :key="c.id" class="border-t border-hairline">
              <td class="px-2 py-1.5 font-medium text-ink">{{ c.name }}</td>
              <td class="px-2 py-1.5 text-ink-2">{{ c.page ?? '—' }}</td>
              <td class="px-2 py-1.5 tabular-nums text-ink-2">{{ c.steps }}</td>
              <td class="px-2 py-1.5 text-ink-3">{{ c.source === 'generated' ? 'drafted from a page read' : c.source }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="mt-2 text-ink-3">No cases saved yet.</p>
    </template>

    <!-- pages scanned -->
    <div v-else-if="view.kind === 'pages'" class="mt-3 overflow-x-auto">
      <table v-if="view.rows?.length" class="w-full text-left">
        <thead class="table-head"><tr><th class="px-2 py-1.5 font-medium">Suite</th><th class="px-2 py-1.5 font-medium">Page</th><th class="px-2 py-1.5 font-medium">URL</th><th class="px-2 py-1.5 font-medium">Targets</th><th class="px-2 py-1.5 font-medium">Links</th><th class="px-2 py-1.5 font-medium">Scanned</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in view.rows" :key="i" class="border-t border-hairline">
            <td class="px-2 py-1.5 text-ink-2">{{ r.suite }}</td>
            <td class="px-2 py-1.5 font-medium text-ink">{{ r.name }}</td>
            <td class="px-2 py-1.5 font-mono text-[11.5px] text-ink-2">{{ cap(r.url, 60) }}</td>
            <td class="px-2 py-1.5 tabular-nums text-ink-2">{{ r.targets }}</td>
            <td class="px-2 py-1.5 tabular-nums text-ink-2">{{ r.linked }}</td>
            <td class="whitespace-nowrap px-2 py-1.5 text-ink-3">{{ at(r.scannedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="text-ink-3">Nothing scanned yet.</p>
    </div>

    <!-- monitoring: the monitors, then what is open -->
    <template v-else-if="view.kind === 'monitoring'">
      <div v-if="view.monitors?.length" class="mt-3 overflow-x-auto">
        <table class="w-full text-left">
          <thead class="table-head"><tr><th class="px-2 py-1.5 font-medium">Monitor</th><th class="px-2 py-1.5 font-medium">Path</th><th class="px-2 py-1.5 font-medium">State</th><th class="px-2 py-1.5 font-medium">Last tick</th></tr></thead>
          <tbody>
            <tr v-for="m in view.monitors" :key="m.id" class="border-t border-hairline">
              <td class="px-2 py-1.5 font-medium text-ink">{{ m.label ?? m.id }}</td>
              <td class="px-2 py-1.5 font-mono text-[11.5px] text-ink-2">{{ m.path }}</td>
              <td class="px-2 py-1.5"><span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="m.state === 'incident' ? 'bg-critical/10 text-critical' : m.state === 'watching' ? 'bg-good/10 text-good' : 'bg-ink/5 text-ink-2'">{{ m.state }}</span></td>
              <td class="whitespace-nowrap px-2 py-1.5 text-ink-3">{{ at(m.lastTickAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul v-if="view.incidents?.length" class="mt-2 space-y-1">
        <li v-for="x in view.incidents" :key="x.id" class="rounded-lg border border-critical/25 bg-critical/5 px-3 py-1.5 text-critical"><span class="font-medium">{{ x.id }}</span> · opened {{ at(x.openedAt) }}<span v-if="x.explanation" class="text-ink-2"> — {{ cap(x.explanation, 140) }}</span></li>
      </ul>
      <p v-else-if="!view.monitors?.length" class="mt-2 text-ink-3">No monitors yet.</p>
    </template>

    <!-- a table somebody attached: its columns and first rows -->
    <div v-else-if="view.kind === 'table'" class="mt-3 overflow-x-auto">
      <table v-if="view.rows?.length" class="w-full text-left">
        <thead class="table-head"><tr><th v-for="(c, i) in view.columns" :key="i" class="whitespace-nowrap px-2 py-1.5 font-medium">{{ c.name }}<span v-if="c.type !== 'text'" class="ml-1 font-normal text-ink-3">{{ c.type }}</span></th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in view.rows" :key="i" class="border-t border-hairline">
            <td v-for="(c, j) in view.columns" :key="j" class="px-2 py-1.5 [overflow-wrap:anywhere]" :class="c.type === 'number' ? 'tabular-nums text-ink-2' : 'text-ink'">{{ r[j] }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="text-ink-3">An empty table.</p>
    </div>
  </div>
</template>
