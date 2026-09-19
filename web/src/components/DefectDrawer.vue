<script setup>
/**
 * One defect, whole, in a panel beside the list.
 *
 * Everything the registry knows about it (GET /api/defects/:id): what broke
 * and where, the evidence — a run's cases and the runs that hit it, or a
 * monitor's failed checks with the clips before and after — the activity
 * as the runner and people wrote it, and the three fields a person may
 * change: the severity, whether it is parked, who has it. The runner
 * refuses a triage from anyone but an owner or admin, so the form is only
 * drawn for one (session.manages); everyone else reads.
 *
 * A panel rather than a page, because triage is a pass over a list: the
 * list stays where it was, Escape or the scrim goes back to it, and the
 * address still names the defect so the panel can be linked to.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '@/api';
import { useSession } from '@/stores/session';
import { SEVERITIES, activityLine, assigneeName, pathOf, severityLook, sourceOf, statusPill, subtitleOf, whereOf } from '@/defects';
import { when } from '@/time';
import Btn from '@/components/Btn.vue';
import Field from '@/components/Field.vue';
import Icon from '@/components/Icon.vue';
import Shot from '@/components/Shot.vue';

const props = defineProps({ id: { type: String, required: true } });
const emit = defineEmits(['close', 'changed']);
const session = useSession();

const defect = ref(null);
const runs = ref([]);
const loading = ref(true);
const error = ref(null);
let seq = 0;
async function load() {
  const mine = ++seq;
  loading.value = true;
  error.value = null;
  try {
    const r = await api.defect(props.id);
    if (mine !== seq) return;
    defect.value = r.defect;
    runs.value = r.runs ?? [];
    fill(r.defect);
  } catch (e) { if (mine === seq) { error.value = e.body?.error || e.message; defect.value = null; } }
  finally { if (mine === seq) loading.value = false; }
}
watch(() => props.id, load, { immediate: true });

const exact = (t) => (t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const isMonitor = computed(() => defect.value?.kind === 'monitor');
const activity = computed(() => (defect.value?.activity ?? []).slice().reverse().map(activityLine));
const monitoringLink = computed(() => {
  const d = defect.value;
  if (!d || d.kind !== 'monitor') return null;
  const q = {};
  if (d.monitor?.page) q.url = d.monitor.page;
  if (d.suites?.[0]?.id) q.suite = d.suites[0].id;
  return { name: 'monitoring', query: q };
});

// ------------------------------------------------------------- the triage
// The three fields, in a form that sends only what changed and asks for
// nothing else: null gives a field back to the runner's own answer.
const severity = ref('');            // '' = the runner's own
const resolution = ref('');          // '' = tracked
const assignee = ref('');            // a member's id, 'me', '' = nobody, or 'name:<text>'
const assigneeText = ref('');
const members = ref([]);
const saving = ref(false);
const saveError = ref(null);
const saved = ref(false);
function fill(d) {
  severity.value = d.severityBy === 'person' ? d.severity : '';
  resolution.value = d.status === 'known_issue' || d.status === 'wont_fix' ? d.status : '';
  // A member is picked by id; anyone else — a name typed in, or a member no
  // longer listed — is the "by name" choice with the text under it.
  const a = d.assignee;
  const listed = !!(a?.id && members.value.some((m) => String(m.id) === String(a.id)));
  assignee.value = !a ? '' : listed ? String(a.id) : 'name:';
  assigneeText.value = a && !listed ? assigneeName(a) : '';
  saved.value = false;
  saveError.value = null;
}
onMounted(async () => {
  if (!session.manages) return;
  try { members.value = await session.members(); } catch { members.value = []; }
  if (defect.value) fill(defect.value);
});
const dirty = computed(() => {
  const d = defect.value;
  if (!d) return false;
  const wantSeverity = severity.value || null;
  const haveSeverity = d.severityBy === 'person' ? d.severity : null;
  const wantRes = resolution.value || null;
  const haveRes = d.status === 'known_issue' || d.status === 'wont_fix' ? d.status : null;
  return wantSeverity !== haveSeverity || wantRes !== haveRes || assigneeChanged.value;
});
const chosenAssignee = computed(() => {
  if (!assignee.value) return null;
  if (assignee.value === 'me') return { id: session.user?.id ?? null, email: session.user?.email ?? null, name: session.user?.name ?? null };
  if (assignee.value === 'name:') { const t = assigneeText.value.trim(); return t ? (t.includes('@') ? { email: t } : { name: t }) : null; }
  const m = members.value.find((x) => String(x.id) === assignee.value);
  return m ? { id: String(m.id), email: m.email ?? null, name: m.name ?? null } : null;
});
const assigneeChanged = computed(() => {
  const have = defect.value?.assignee ?? null;
  const want = chosenAssignee.value;
  if (!have && !want) return false;
  if (!have || !want) return true;
  return ['id', 'email', 'name'].some((k) => (have[k] ?? null) !== (want[k] ?? null));
});
async function save() {
  const d = defect.value;
  if (!d || !dirty.value) return;
  saving.value = true;
  saveError.value = null;
  const patch = {};
  const wantSeverity = severity.value || null;
  if (wantSeverity !== (d.severityBy === 'person' ? d.severity : null)) patch.severity = wantSeverity;
  const wantRes = resolution.value || null;
  if (wantRes !== (d.status === 'known_issue' || d.status === 'wont_fix' ? d.status : null)) patch.resolution = wantRes;
  if (assigneeChanged.value) patch.assignee = chosenAssignee.value;
  try {
    const r = await api.triageDefect(d.id, patch);
    defect.value = r.defect;
    fill(r.defect);
    saved.value = true;
    emit('changed', r.defect);
  } catch (e) { saveError.value = e.body?.error || e.message; }
  finally { saving.value = false; }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-30 bg-scrim/40" aria-hidden="true" @click="emit('close')" />
    <aside class="fixed inset-y-0 right-0 z-40 flex w-full max-w-[560px] flex-col border-l border-hairline bg-panel shadow-2xl"
           role="dialog" aria-modal="true" :aria-label="defect ? `${defect.id} ${defect.title}` : 'Defect'" data-defect-drawer>
      <header class="flex items-start gap-3 border-b border-hairline px-5 py-4">
        <div class="min-w-0 grow">
          <p class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-[12.5px] text-ink-3">{{ props.id }}</span>
            <template v-if="defect">
              <span class="rounded-full px-2 py-0.5 text-[11.5px] font-medium" :class="statusPill(defect.status).tone">{{ statusPill(defect.status).label }}</span>
              <span class="inline-flex items-center gap-1.5 text-[12px] font-medium" :class="severityLook(defect.severity).text">
                <i class="size-2 rounded-[2px]" :class="severityLook(defect.severity).swatch" />{{ severityLook(defect.severity).label }}
                <span class="font-normal text-ink-3">· {{ defect.severityBy === 'person' ? 'set by a person' : 'the runner’s call' }}</span>
              </span>
            </template>
          </p>
          <h2 v-if="defect" class="mt-1.5 text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{{ defect.title }}</h2>
        </div>
        <button type="button" class="shrink-0 rounded-full border border-hairline p-1.5 text-ink-2 hover:border-ink/25 hover:text-ink" aria-label="Close" @click="emit('close')">
          <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>

      <div class="min-h-0 grow overflow-y-auto px-5 py-4">
        <p v-if="loading && !defect" class="text-[13.5px] text-ink-3">Reading the defect…</p>
        <p v-else-if="error" class="rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">{{ error }}</p>

        <template v-else-if="defect">
          <!-- Where, and what the runner was doing: a run's step, or a monitor's rule. -->
          <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            <span class="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-[11.5px]" :title="sourceOf(defect).title">
              <Icon :name="sourceOf(defect).icon" class="size-3 text-ink-3" />found by a {{ sourceOf(defect).label }}
            </span>
            <span>{{ whereOf(defect) }}</span>
          </p>
          <p v-if="subtitleOf(defect)" class="mt-1.5 text-[12.5px] text-ink-2 [overflow-wrap:anywhere]">{{ subtitleOf(defect) }}</p>
          <p v-if="defect.url" class="mt-1 truncate font-mono text-[11.5px] text-ink-3" :title="defect.url">{{ defect.url }}</p>

          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-4">
            <div><dt class="text-ink-3">First seen</dt><dd class="m-0 mt-0.5 text-ink" :title="exact(defect.firstSeen)">{{ when(defect.firstSeen) }}</dd></div>
            <div><dt class="text-ink-3">Last seen</dt><dd class="m-0 mt-0.5 text-ink" :title="exact(defect.lastSeen)">{{ when(defect.lastSeen) }}</dd></div>
            <div><dt class="text-ink-3">Seen</dt><dd class="m-0 mt-0.5 text-ink tabular-nums">{{ defect.hits }} time{{ defect.hits === 1 ? '' : 's' }}<template v-if="defect.reopened"> · reopened {{ defect.reopened }}×</template></dd></div>
            <div><dt class="text-ink-3">Assignee</dt><dd class="m-0 mt-0.5 text-ink">{{ defect.assignee ? assigneeName(defect.assignee) : 'nobody yet' }}</dd></div>
          </dl>

          <!-- A monitor's evidence: the checks that failed, the clips, the verdict. -->
          <section v-if="isMonitor" class="mt-5">
            <h3 class="eyebrow">Evidence</h3>
            <div v-for="x in defect.evidence?.violations ?? []" :key="x.checkId ?? x.message" class="mt-2 rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px]">
              <p>{{ x.message }}</p>
              <p v-if="x.actual != null || x.expected != null" class="mt-0.5 font-mono text-[11.5px] text-ink-2 [overflow-wrap:anywhere]">
                <template v-if="x.actual != null">actual {{ x.actual }}</template><template v-if="x.expected != null"> · expected {{ x.expected }}</template><template v-if="x.baseline != null"> · baseline {{ x.baseline }}</template>
              </p>
            </div>
            <div v-if="defect.evidence?.before || defect.evidence?.after" class="mt-3 grid gap-2 sm:grid-cols-2">
              <Shot caption="before (baseline)" :name="defect.evidence.before" :alt="`${defect.monitor?.label ?? 'the element'} before`" />
              <Shot caption="after" :name="defect.evidence.after" :alt="`${defect.monitor?.label ?? 'the element'} after`" />
            </div>
            <p v-if="defect.evidence?.verdict" class="mt-3 rounded-xl border border-hairline bg-ground p-3 text-[13px] leading-relaxed">{{ defect.evidence.verdict }}</p>
            <p class="mt-2 text-[12.5px]">
              <RouterLink v-if="monitoringLink" :to="monitoringLink" class="text-brand-2 underline underline-offset-2 hover:text-brand">Open in Monitoring</RouterLink>
              <span v-if="defect.monitor?.page" class="text-ink-3"> · {{ pathOf(defect.monitor.page) }}</span>
            </p>
          </section>

          <!-- A run's evidence: the cases it takes down, and the runs that hit it. -->
          <section v-else class="mt-5">
            <h3 class="eyebrow">Cases it takes down</h3>
            <div v-if="defect.cases?.length" class="mt-2 flex flex-wrap gap-1.5">
              <RouterLink v-for="c in defect.cases" :key="c.key" :to="c.suiteId ? `/suites/${c.suiteId}/cases` : '/suites'"
                          class="max-w-[16rem] truncate rounded-full border border-hairline px-2.5 py-1 text-[12px] text-ink-2 hover:border-ink/30" :title="`${c.suite ?? ''} · ${c.name ?? ''}`">
                {{ c.name ?? c.suite ?? 'a case' }}<span v-if="c.suite && c.name" class="text-ink-3"> · {{ c.suite }}</span>
              </RouterLink>
            </div>
            <p v-else class="mt-2 text-[12.5px] text-ink-3">A script run from the console, with no case behind it.</p>
            <h3 class="eyebrow mt-4">Runs that hit it</h3>
            <ul v-if="runs.length" class="mt-2 divide-y divide-hairline border-y border-hairline">
              <li v-for="r in runs" :key="r.at" class="flex items-center gap-3 py-2 text-[12.5px]">
                <span class="shrink-0 tabular-nums text-ink-3" :title="exact(r.at)">{{ when(r.at) }}</span>
                <span class="min-w-0 grow truncate" :title="r.suite">{{ r.suite }}</span>
                <span class="shrink-0 tabular-nums text-ink-2">{{ r.passed }}/{{ r.total }}<template v-if="r.step != null"> · step {{ r.step + 1 }}</template></span>
              </li>
            </ul>
            <p v-else class="mt-2 text-[12.5px] text-ink-3">History no longer holds the runs behind it.</p>
          </section>

          <!-- Triage: an owner's or admin's; the runner refuses anyone else. -->
          <section v-if="session.manages" class="mt-5 rounded-xl border border-hairline bg-ground p-4" data-defect-triage>
            <h3 class="eyebrow">Triage</h3>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Severity">
                <select v-model="severity">
                  <option value="">the runner’s own ({{ defect.autoSeverity }})</option>
                  <option v-for="s in SEVERITIES" :key="s" :value="s">{{ s }}</option>
                </select>
              </Field>
              <Field label="Track it as" :hint="defect.status === 'closed' ? 'Passing again: nothing to park.' : ''">
                <select v-model="resolution" :disabled="defect.status === 'closed'">
                  <option value="">a failing defect</option>
                  <option value="known_issue">a known issue</option>
                  <option value="wont_fix">won’t fix</option>
                </select>
              </Field>
              <Field label="Assignee" class="sm:col-span-2">
                <select v-model="assignee">
                  <option value="">nobody</option>
                  <option v-if="session.user?.email" value="me">me ({{ session.user.name || session.user.email }})</option>
                  <option v-for="m in members.filter((x) => !x.you)" :key="m.id" :value="String(m.id)">{{ m.name || m.email }}</option>
                  <option value="name:">someone by name or address…</option>
                </select>
              </Field>
              <Field v-if="assignee === 'name:'" label="Name or email" class="sm:col-span-2">
                <input v-model="assigneeText" placeholder="Monica, or monica@acme.com" @keydown.enter.prevent="save">
              </Field>
            </div>
            <div class="mt-3 flex items-center gap-3">
              <Btn size="sm" :busy="saving" busy-label="Saving…" :disabled="!dirty" @click="save">Save triage</Btn>
              <span v-if="saveError" class="text-[12.5px] text-critical">{{ saveError }}</span>
              <span v-else-if="saved && !dirty" class="text-[12.5px] text-good">Saved.</span>
              <span v-else class="text-[12px] text-ink-3">Recorded with who changed it.</span>
            </div>
          </section>

          <section class="mt-5">
            <h3 class="eyebrow">Activity</h3>
            <ol class="mt-2 space-y-2.5" data-defect-activity>
              <li v-for="(e, i) in activity" :key="i" class="flex items-start gap-2.5 text-[12.5px]">
                <Icon :name="e.icon" class="mt-0.5 size-3.5 shrink-0" :class="e.tone" />
                <span class="min-w-0 grow [overflow-wrap:anywhere]">
                  {{ e.text }}
                  <span class="text-ink-3"> · {{ e.who }} · <span :title="exact(e.at)">{{ when(e.at) }}</span></span>
                </span>
              </li>
            </ol>
          </section>
        </template>
      </div>
    </aside>
  </Teleport>
</template>
