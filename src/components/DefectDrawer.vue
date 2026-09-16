<script setup>
/**
 * One defect, opened from the list: what the runner saw, who has triaged it,
 * and everything that has happened to it.
 *
 * A sheet over the list rather than a page of its own, because triage happens
 * down a list — open one, set it, open the next — and a page would lose the
 * place, the filters and the scroll each time. The URL still names it
 * (/defects/DEF-2609-007), so a number pasted into a ticket opens straight to
 * the defect.
 *
 * The facts are the runner's, read-only here as they are on the server. The
 * three triage fields are controls for an owner or admin, each saved as it
 * changes — there is no Save to forget — and plain text for anyone else, since
 * the runner would refuse them.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { useSession } from '@/stores/session';
import DefectStatus from '@/components/DefectStatus.vue';
import SeverityMark from '@/components/SeverityMark.vue';
import { SEVERITIES, SEVERITY_ORDER, STATUSES, activityLine } from '@/defects';

const props = defineProps({
  id: { type: String, required: true },
  /** The organisation's members to assign to. Empty with no control plane, where a name is typed instead. */
  members: { type: Array, default: () => [] },
});
const emit = defineEmits(['close', 'changed']);

const session = useSession();
const live = useLive();

const data = ref(null);
const error = ref('');
const saving = ref('');
const saved = ref('');
const copied = ref(false);
// Bumped when a save is refused, so the controls redraw from the defect as it
// still is instead of keeping the choice that did not take.
const formKey = ref(0);
const closer = ref(null);

async function load() {
  error.value = '';
  try {
    data.value = await api.defect(props.id);
  } catch (e) {
    data.value = null;
    error.value = e.status === 404
      ? `There is no ${props.id} in this organisation. It may have closed long enough ago to be forgotten.`
      : e.message;
  }
}
watch(() => props.id, load, { immediate: true });
// A run that has just ended may have closed or reopened this one.
watch(() => live.running, (now, before) => { if (before && !now) load(); });

const d = computed(() => data.value?.defect ?? null);
const runs = computed(() => data.value?.runs ?? []);
const activity = computed(() => [...(d.value?.activity ?? [])].reverse());
// For drawing the controls only: the runner decides again, from the token.
const canTriage = computed(() => session.manages);

/**
 * Save one field as it changes, and hand the list the defect as the runner now
 * has it. Each field is its own decision, recorded on its own, so there is
 * nothing to batch behind a button.
 */
async function change(field, value) {
  saving.value = field;
  error.value = '';
  try {
    const { defect } = await api.triageDefect(d.value.id, { [field]: value });
    data.value = { ...data.value, defect };
    emit('changed', defect);
    saved.value = field;
    setTimeout(() => { if (saved.value === field) saved.value = ''; }, 1800);
  } catch (e) {
    error.value = e.message;
    formKey.value++;
  } finally {
    saving.value = '';
  }
}

const severityValue = computed(() => (d.value?.severityBy === 'person' ? d.value.severity : ''));
const resolutionValue = computed(() => (['known_issue', 'wont_fix'].includes(d.value?.status) ? d.value.status : ''));

const nameOf = (a) => (a ? a.name || a.email : '');
const memberKey = (m) => String(m.id ?? m.email);
/** The member it is assigned to — or `saved`, for an assignee the member list no longer has. */
const assigneeValue = computed(() => {
  const a = d.value?.assignee;
  if (!a) return '';
  const m = props.members.find((x) => (a.id != null && String(x.id) === String(a.id)) || (a.email && x.email === a.email));
  return m ? memberKey(m) : 'saved';
});
function pickMember(key) {
  if (key === 'saved') return;
  const m = props.members.find((x) => memberKey(x) === key);
  change('assignee', m ? { id: m.id == null ? null : String(m.id), email: m.email ?? null, name: m.name || null } : null);
}

// With no control plane there are no members, only a name to type.
const typed = ref('');
watch(d, (v) => { typed.value = nameOf(v?.assignee); }, { immediate: true });
function typeName() {
  const text = typed.value.trim();
  if (text === nameOf(d.value?.assignee)) return;
  change('assignee', !text ? null : text.includes('@') ? { email: text } : { name: text });
}

async function copy() {
  try {
    await navigator.clipboard.writeText(d.value.id);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  } catch { /* no clipboard in this context; the number is on screen to select */ }
}

const onKey = (e) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => {
  window.addEventListener('keydown', onKey);
  nextTick(() => closer.value?.focus());
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

const CONTROL = 'w-full rounded-lg border border-hairline bg-panel px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand disabled:opacity-60';

const when = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const full = (t) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dur = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
</script>

<template>
  <div class="fixed inset-0 z-30 flex justify-end bg-ink/25" @click.self="emit('close')">
    <aside class="flex h-full w-full max-w-[560px] flex-col border-l border-hairline bg-panel shadow-[0_0_48px_rgb(16_16_20/0.14)]"
           role="dialog" aria-modal="true" aria-labelledby="defect-number">
      <header class="flex items-center gap-2 border-b border-hairline px-5 py-3.5">
        <h2 id="defect-number" class="font-mono text-[14px] font-semibold">{{ d?.id ?? id }}</h2>
        <button v-if="d" type="button" :title="`Copy ${d.id}`"
                class="rounded-md px-1.5 py-0.5 text-[11.5px] text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
                @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
        <DefectStatus v-if="d" :status="d.status" size="sm" class="ml-1" />
        <button ref="closer" type="button" aria-label="Close"
                class="ml-auto grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
                @click="emit('close')">
          <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6"
               stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>

      <div class="flex-1 overflow-y-auto px-5 py-5">
        <p v-if="error" class="mb-4 rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ error }}</p>
        <p v-else-if="!d" class="text-[13px] text-ink-3">Reading {{ id }}…</p>

        <template v-if="d">
          <p class="font-mono text-[13px] leading-relaxed text-ink">{{ d.title }}</p>
          <p class="mt-2 text-[12.5px] text-ink-3">{{ STATUSES[d.status]?.means }}.</p>

          <dl class="mt-5 grid grid-cols-[7rem_minmax(0,1fr)] gap-y-2 text-[13px]">
            <dt class="text-ink-3">Reporter</dt>
            <dd class="flex items-center gap-1.5">
              <span class="grid size-4 shrink-0 place-items-center rounded bg-ink"><span class="size-1 rounded-full bg-brand" /></span>
              ghostclick <span class="text-ink-3">· filed when a run failed</span>
            </dd>
            <dt class="text-ink-3">Created</dt>
            <dd>{{ full(d.firstSeen) }}</dd>
            <dt class="text-ink-3">Last seen</dt>
            <dd>{{ when(d.lastSeen) }} <span class="text-ink-3">· {{ full(d.lastSeen) }}</span></dd>
            <dt class="text-ink-3">Hits</dt>
            <dd class="tabular-nums">
              {{ d.hits }} failed run{{ d.hits === 1 ? '' : 's' }}<template v-if="d.reopened"> · reopened {{ d.reopened }} time{{ d.reopened === 1 ? '' : 's' }}</template>
            </dd>
            <template v-if="d.step !== null">
              <dt class="text-ink-3">Stopped at</dt>
              <dd>step {{ d.step + 1 }}<template v-if="d.target"> · <span class="font-mono text-[12.5px]">{{ d.target }}</span></template></dd>
            </template>
            <template v-if="d.origin">
              <dt class="text-ink-3">Site</dt>
              <dd class="truncate font-mono text-[12.5px]" :title="d.url">{{ d.origin }}</dd>
            </template>
            <template v-if="d.closedAt">
              <dt class="text-ink-3">Closed</dt>
              <dd>{{ full(d.closedAt) }}</dd>
            </template>
          </dl>

          <section class="mt-6 rounded-xl border border-hairline bg-ground p-4">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="text-[13.5px] font-medium">Triage</h3>
              <span v-if="!canTriage" class="text-[12px] text-ink-3">Only an owner or admin can change these</span>
            </div>

            <div v-if="canTriage" :key="formKey" class="mt-3 grid gap-3 sm:grid-cols-3">
              <label class="block">
                <span class="mb-1 flex gap-1.5 text-[12px] text-ink-3">Assignee<span v-if="saved === 'assignee'" class="text-good">· saved</span></span>
                <select v-if="members.length" :value="assigneeValue" :disabled="saving === 'assignee'" :class="CONTROL"
                        @change="pickMember($event.target.value)">
                  <option value="">Unassigned</option>
                  <option v-if="assigneeValue === 'saved'" value="saved">{{ nameOf(d.assignee) }}</option>
                  <option v-for="m in members" :key="memberKey(m)" :value="memberKey(m)">{{ m.name || m.email }}</option>
                </select>
                <input v-else v-model="typed" :disabled="saving === 'assignee'" placeholder="Type a name" :class="CONTROL"
                       @change="typeName" @keydown.enter.prevent="$event.target.blur()">
              </label>
              <label class="block">
                <span class="mb-1 flex gap-1.5 text-[12px] text-ink-3">Severity<span v-if="saved === 'severity'" class="text-good">· saved</span></span>
                <select :value="severityValue" :disabled="saving === 'severity'" :class="CONTROL"
                        title="Auto is ghostclick's own judgement; pick one to overrule it"
                        @change="change('severity', $event.target.value || null)">
                  <option value="">Auto · {{ SEVERITIES[d.autoSeverity] }}</option>
                  <option v-for="s in SEVERITY_ORDER" :key="s" :value="s">{{ SEVERITIES[s] }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 flex gap-1.5 text-[12px] text-ink-3">Resolution<span v-if="saved === 'resolution'" class="text-good">· saved</span></span>
                <select :value="resolutionValue" :disabled="saving === 'resolution' || d.status === 'closed'" :class="CONTROL"
                        :title="d.status === 'closed' ? 'It is passing again, so there is nothing to park' : 'Park a failing defect; it is tracked automatically otherwise'"
                        @change="change('resolution', $event.target.value || null)">
                  <option value="">None</option>
                  <option value="known_issue">Known issue</option>
                  <option value="wont_fix">Won't fix</option>
                </select>
              </label>
            </div>

            <dl v-else class="mt-3 grid gap-3 text-[13px] sm:grid-cols-3">
              <div><dt class="text-[12px] text-ink-3">Assignee</dt><dd class="mt-1">{{ nameOf(d.assignee) || 'Unassigned' }}</dd></div>
              <div><dt class="text-[12px] text-ink-3">Severity</dt><dd class="mt-1"><SeverityMark :severity="d.severity" :auto="d.severityBy === 'ghostclick'" /></dd></div>
              <div><dt class="text-[12px] text-ink-3">Resolution</dt><dd class="mt-1">{{ resolutionValue ? STATUSES[resolutionValue].label : 'Tracked automatically' }}</dd></div>
            </dl>
          </section>

          <section class="mt-6">
            <h3 class="text-[13.5px] font-medium">Cases it took down <span class="font-normal text-ink-3">{{ d.cases.length }}</span></h3>
            <ul class="mt-2 divide-y divide-hairline rounded-xl border border-hairline">
              <li v-for="c in d.cases" :key="c.key" class="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                <span class="min-w-0 flex-1 truncate">{{ c.name ?? 'A script run from the console' }}</span>
                <span class="max-w-[40%] shrink-0 truncate text-[12px] text-ink-3">{{ c.suite }}</span>
                <RouterLink v-if="c.suiteId" :to="`/suites/${c.suiteId}/cases`"
                            class="shrink-0 text-[12px] text-brand-2 hover:underline">Open</RouterLink>
              </li>
            </ul>
          </section>

          <section class="mt-6">
            <h3 class="text-[13.5px] font-medium">Recent failures <span class="font-normal text-ink-3">{{ runs.length }} still in run history</span></h3>
            <ol v-if="runs.length" class="mt-2 space-y-1.5">
              <li v-for="r in runs" :key="`${r.at}-${r.caseId ?? r.suite}`" class="flex items-baseline gap-3 text-[12.5px]">
                <span class="w-20 shrink-0 text-ink-3" :title="full(r.at)">{{ when(r.at) }}</span>
                <span class="min-w-0 flex-1 truncate">{{ r.caseName ?? r.suite }}</span>
                <span class="shrink-0 tabular-nums text-ink-3">step {{ r.step + 1 }} · {{ dur(r.ms) }}</span>
              </li>
            </ol>
            <p v-else class="mt-2 text-[12.5px] text-ink-3">These runs have aged out of history; the defect keeps what it needs.</p>
          </section>

          <section class="mt-6 pb-2">
            <h3 class="text-[13.5px] font-medium">Activity</h3>
            <ol class="mt-3 space-y-3 border-l border-hairline pl-4">
              <li v-for="(ev, i) in activity" :key="i" class="relative text-[12.5px]">
                <!-- The runner's events in the colour of the status they left
                     behind; a person's changes in the accent. -->
                <span class="absolute -left-[21.5px] top-1.5 size-2.5 rounded-full ring-2 ring-panel"
                      :class="ev.by != null ? 'bg-brand'
                        : ({ filed: 'bg-status-open', reopened: 'bg-status-reopened', closed: 'bg-status-closed' }[ev.kind] ?? 'bg-ink')" />
                <p class="text-ink">{{ activityLine(ev) }}</p>
                <p class="text-ink-3" :title="full(ev.at)">{{ when(ev.at) }}</p>
              </li>
            </ol>
          </section>
        </template>
      </div>
    </aside>
  </div>
</template>
