<script setup>
/**
 * Incidents.
 *
 * What the monitors caught, with the evidence: what the rule said, what the
 * numbers were, the before and after clips, and the verdict when one was
 * asked for.
 *
 * They used to sit at the foot of the monitoring page, under the stage and the
 * rail — the page you go to in order to WATCH something, which is a different
 * errand from reading what has already happened. So they have a page of their
 * own, and the monitoring page keeps a line pointing here.
 *
 * Nothing here decides anything: the runner says when an incident opens and
 * what became of it, the store mirrors it over the one socket, and this view
 * draws the mirror.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { useSuites } from '@/stores/suites';
import { chipTone, diffChips, incidentPill, pageLines, pageNotes, projectOf, selectorLine, severityTone, verdictSource } from '@/monitoring';
import { clock, when } from '@/time';
import TopBar from '@/components/TopBar.vue';
import Btn from '@/components/Btn.vue';
import EmptyState from '@/components/EmptyState.vue';
import Shot from '@/components/Shot.vue';

const live = useLive();
const route = useRoute();
const router = useRouter();
const suites = useSuites();

const loading = ref(false);
const loadError = ref(null);
const only = ref('open');       // open | all
const pending = ref(null);      // the id whose row action is in flight
const rowError = ref(null);     // { id, msg }

// The same project scope the monitoring page uses: ?suite= in the address.
const projectId = computed(() => (route.query.suite ? String(route.query.suite) : null));
const project = computed(() => suites.list.find((s) => s.id === projectId.value) ?? null);
const isMine = (m) => !project.value || projectOf(m, suites.list)?.id === project.value.id;
const mineIds = computed(() => new Set(live.monitors.filter(isMine).map((m) => m.id)));

// "Open" is everything unresolved: an incident Claude is still judging is
// not closed, whichever way it turns out.
const unresolved = (i) => i.status !== 'resolved';
const incidents = computed(() => live.incidents
  .filter((i) => (!project.value || mineIds.value.has(i.monitorId)) && (only.value === 'all' || unresolved(i)))
  .sort((a, b) => b.openedAt - a.openedAt));
const openCount = computed(() => (project.value
  ? live.incidents.filter((i) => unresolved(i) && mineIds.value.has(i.monitorId)).length
  : live.openIncidents));

const crumbs = computed(() => (project.value
  ? [{ label: 'Test suites', to: '/suites' }, { label: project.value.name, to: `/suites/${project.value.id}` }, { label: 'Incidents' }]
  : [{ label: 'Incidents' }]));

/** Where the monitor that raised this incident is watched from. */
const watchedAt = (inc) => ({ path: '/monitoring', query: project.value ? { suite: project.value.id } : {} });

async function load() {
  loading.value = true;
  loadError.value = null;
  try { await live.loadMonitoring(); } catch (e) { loadError.value = e.message; }
  finally { loading.value = false; }
}
onMounted(async () => {
  await load();
  if (!suites.listed) await suites.loadList().catch(() => null);
});

/** One shape for every row action: busy on the row, the error beside it. */
async function act(id, fn) {
  pending.value = id;
  rowError.value = null;
  try { await fn(); } catch (e) { rowError.value = { id, msg: e.message }; }
  finally { pending.value = null; }
}
const resolve = (inc) => act(inc.id, async () => {
  const r = await api.resolveIncident(inc.id);
  live.upsertIncident(r.incident);
  if (r.monitor) live.upsertMonitor(r.monitor);
});
</script>

<template>
  <div>
    <TopBar :crumbs="crumbs" />

    <div class="p-5">
      <section class="card p-5">
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
          <RouterLink :to="watchedAt()" class="ml-auto rounded-full border border-hairline px-3.5 py-1.5 text-[13px] hover:border-ink/25">
            Monitors
          </RouterLink>
          <button class="rounded-full border border-hairline px-3.5 py-1.5 text-[13px] hover:border-ink/25"
                  @click="load">Refresh</button>
        </div>
        <p class="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-2">
          What the monitors caught, newest first. Each one keeps the rule it broke, the numbers, the
          clips from before and after, and the verdict when one was asked for.
        </p>

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
              <span class="mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium" :class="incidentPill(inc).tone" :title="incidentPill(inc).title">
                {{ incidentPill(inc).label }}
              </span>
              <p class="min-w-0 grow text-[13.5px] font-medium">{{ inc.monitorLabel }}</p>
              <span class="text-[12.5px] tabular-nums text-ink-3">
                {{ clock(inc.openedAt) }}<template v-if="inc.resolvedAt"> → {{ clock(inc.resolvedAt) }}</template> · {{ when(inc.openedAt) }}
              </span>
            </div>
            <p class="mt-1 truncate font-mono text-[11.5px] text-ink-3" :title="inc.selector">{{ selectorLine(inc.selector) }}</p>
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
            <!-- The whole page: what was added, what went, what moved, what was reworded — the samples; the chips have the totals. -->
            <ul v-if="pageLines(inc.diff).length" class="mt-2 space-y-0.5 font-mono text-[11.5px] text-ink-2" data-page-lines>
              <li v-for="(l, i) in pageLines(inc.diff)" :key="i" class="truncate" :title="l">{{ l }}</li>
            </ul>
            <!-- What the diff forgave or anticipated: a scroll between the readings, a reading at another width. -->
            <p v-for="(n, i) in pageNotes(inc.diff)" :key="'note' + i" class="mt-1 text-[11.5px] text-ink-3" data-page-note>{{ n }}</p>

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
                <!-- Judged fine on a judged clause: the judge closed it and the
                     element as it is now became the baseline. Judged fine on a
                     hard check, the incident stays open — the number still fails. -->
                <span v-if="inc.resolvedBy === 'judge'" class="rounded-full border px-2 py-0.5 text-[11.5px]" :class="chipTone('info')"
                      title="Claude read the change and found the rule still holds — the monitor took the new state as its baseline">
                  judged fine — new baseline
                </span>
                <span v-else-if="inc.verdict.violation === false" class="rounded-full border px-2 py-0.5 text-[11.5px]" :class="chipTone('warn')">
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
  </div>
</template>
