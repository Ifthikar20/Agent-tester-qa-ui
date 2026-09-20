<script setup>
/**
 * The live console.
 *
 * The canvas is a video of another browser — Stage.vue, shared with the
 * monitoring page, is what draws it and forwards what you do on it. This view
 * is the chrome around it: the address and its buttons over the stage, the
 * recording beside it, and along the bottom a dock of tabs for everything else
 * — the run, the runner's log, where the page went, the page's own console,
 * the script and what is on the page.
 *
 * Arriving with ?suite=&url= means "record into this suite" — the recording
 * goes back as a case without anyone copying text between two windows.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { showAction, labelAction } from '@lang';
import { useSuites } from '@/stores/suites';
import { DOCK_TABS, useUi } from '@/stores/ui';
import TopBar from '@/components/TopBar.vue';
import Field from '@/components/Field.vue';
import FlowBox from '@/components/FlowBox.vue';
import Btn from '@/components/Btn.vue';
import AddressBar from '@/components/AddressBar.vue';
import UpgradePrompt from '@/components/UpgradePrompt.vue';
import Stage from '@/components/Stage.vue';

const route = useRoute();
const live = useLive();
const suites = useSuites();
const ui = useUi();

const script = ref('');
const urlBox = ref('');
const caseName = ref('Recorded flow');
const saved = ref(null);
const error = ref(null);
const saveError = ref(null);   // shown in the Recording card, beside the button
const opening = ref(null);
const saving = ref(false);
const allowing = ref(false);
const cases = ref([]);
const picked = ref('');
const loaded = ref(null);      // which saved case is in the box, if any

const suiteId = computed(() => route.query.suite ?? null);

// Which suite a recording is saved into: the one the console was opened from,
// or the one you pick when it was opened on its own. A recording is worth
// keeping wherever it was made.
const saveTo = ref(suiteId.value);
watch(suiteId, (id) => { saveTo.value = id; });

/** Same page, ignoring a trailing slash — which is not a different page. */
const sameUrl = (a, b) => {
  if (!a || !b) return false;
  const norm = (u) => { try { return new URL(u).href.replace(/\/$/, ''); } catch { return String(u).replace(/\/$/, ''); } };
  return norm(a) === norm(b);
};
const suite = computed(() => suites.list.find((s) => s.id === suiteId.value) ?? null);

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : /(?:[sx]|ch|sh)$/.test(w) ? 'es' : 's'}`;

// -------------------------------------------------------------------- dock
/**
 * The dock along the bottom: the run as it happens, what the runner said,
 * where the page went, what the page printed, the script, and what is on the
 * page. Tabs, because you read one of them at a time and the canvas is what
 * the rest of the screen is for; docked, because the run used to be a card in
 * the rail — below the fold, out of sight of the canvas it was describing.
 *
 * A run starting brings its tab forward and opens the dock, even one you
 * folded: watching the steps land is why you pressed Run.
 */
const LABELS = { run: 'Run', log: 'Log', nav: 'Where it went', console: 'Console', script: 'Script', targets: 'On this page' };
const TONE = { live: 'bg-brand-50 text-brand-2', pass: 'bg-good/10 text-good', fail: 'bg-critical/10 text-critical' };
const dockPanel = ref(null);
const runList = ref(null);

/** The Run tab's badge: how far the run has got, and how it is going. */
const runState = computed(() => {
  const run = live.run;
  if (!run) return null;
  const passed = run.steps.filter((s) => s.state === 'pass').length;
  const text = `${passed}/${run.total}`;
  if (live.running) return { tone: 'live', text, title: 'running' };
  if (run.steps.some((s) => s.state === 'fail')) return { tone: 'fail', text, title: `failed — ${passed} of ${run.total} steps passed` };
  return passed === run.total ? { tone: 'pass', text, title: 'passed' } : { tone: 'dim', text };
});

/**
 * Follow the running step down the list — a recorded flow is taller than the
 * dock — unless you have scrolled away from it to read something, when being
 * dragged back on every step is worse than scrolling down yourself.
 *
 * With nothing running, the step that failed is the one followed. Its error
 * arrives after it stopped running and makes the row taller, so following
 * only the running step left that error just under the fold — the one line
 * the run produced that you actually came to read.
 */
let following = true;
const activeRow = () => {
  const box = runList.value;
  return box?.querySelector('[data-state="run"]') ?? [...(box?.querySelectorAll('[data-state="fail"]') ?? [])].at(-1);
};
const inView = (row, box) => row.offsetTop >= box.scrollTop - 1
  && row.offsetTop + row.offsetHeight <= box.scrollTop + box.clientHeight + 1;
function onRunScroll() {
  const row = activeRow();
  if (row) following = inView(row, runList.value);
}
watch(() => live.run, (run, before) => {
  if (!run || run === before) return;
  following = true;
  if (runList.value) runList.value.scrollTop = 0;
  ui.reveal('run');
});
// A step changing state moves the running row on, or makes it taller with an
// error; the tab coming into view draws the list afresh. Each is a reason to follow.
watch([() => live.run?.steps.map((s) => s.state).join(), () => ui.dockOpen && ui.dockTab === 'run'], () => {
  const box = runList.value;
  const row = activeRow();
  if (!box || !row || !following || inView(row, box)) return;
  // Bottom of the row into view — but never its top out of it, for an error
  // longer than the dock is tall.
  box.scrollTop = Math.min(row.offsetTop, row.offsetTop + row.offsetHeight - box.clientHeight);
}, { flush: 'post' });

/**
 * Consecutive identical lines, folded into one with a count.
 *
 * A step that retries five times said the same sentence five times, which is
 * five times harder to read than the one line it deserved — and pushed the
 * thing that actually went wrong off the top.
 */
const fold = (rows, same) => {
  const out = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last && same(last, r)) { last.n += 1; continue; }
    out.push({ ...r, n: 1 });
  }
  return out;
};

/**
 * The Log and Console tabs: what the runner said while driving the page, and
 * what the page itself printed — filtered the way DevTools filters, by level
 * and by a word. Newest first, as the store keeps them: the line you came for
 * is the last one said. Two tabs rather than one stream, because the page and
 * the runner are two different voices and each is usually read on its own.
 */
const LEVELS = ['error', 'warn', 'info', 'debug'];
const LEVEL_NAMES = { error: 'Errors', warn: 'Warnings', info: 'Info', debug: 'Debug' };
const LEVEL_ON = {
  error: 'bg-critical/10 font-medium text-critical', warn: 'bg-warn/10 font-medium text-warn',
  info: 'bg-ink/[0.07] font-medium text-ink', debug: 'bg-ink/[0.07] font-medium text-ink-2',
};
const LEVEL_TEXT = { error: 'text-critical', warn: 'text-warn', info: 'text-ink-3', debug: 'text-ink-3' };
const ROW_TINT = { error: 'bg-critical/[0.04]', warn: 'bg-warn/[0.06]' };
const ROW_TEXT = { error: 'text-critical', warn: 'text-warn', info: 'text-ink', debug: 'text-ink-3' };
/** DevTools' buckets. A `log` files under info: nobody wants one without the other. */
const levelOf = (level) => (LEVELS.includes(level) ? level : 'info');

/** One filterable feed: its rows, the levels and the word picked, and what those leave. */
function feed(lines) {
  const levels = ref([]);          // none picked: every level
  const query = ref('');
  const rows = computed(lines);
  const found = computed(() => {
    const q = query.value.trim().toLowerCase();
    return q ? rows.value.filter((r) => r.text.toLowerCase().includes(q)) : rows.value;
  });
  /** Rows per level among the word's matches, for the level buttons' own counts. */
  const counts = computed(() => {
    const n = { error: 0, warn: 0, info: 0, debug: 0 };
    for (const r of found.value) n[r.level] += 1;
    return n;
  });
  const shown = computed(() => fold(
    levels.value.length ? found.value.filter((r) => levels.value.includes(r.level)) : found.value,
    (a, b) => a.text === b.text && a.level === b.level,
  ));
  /** Errors are the reason to look, so their count rides on the tab — open or folded. */
  const errors = computed(() => rows.value.filter((r) => r.level === 'error').length);
  const toggle = (level) => {
    levels.value = levels.value.includes(level) ? levels.value.filter((l) => l !== level) : [...levels.value, level];
  };
  return reactive({ levels, query, rows, counts, shown, errors, toggle });
}
const log = feed(() => live.log.map((l) => ({ id: l.id, at: l.at, level: levelOf(l.level), said: l.level, text: String(l.msg ?? '') })));
const con = feed(() => live.console.map((l) => ({ id: l.id, at: l.at ?? null, level: levelOf(l.level), said: l.level, text: String(l.text ?? '') })));
/** Whichever of the two the dock is showing — one panel draws both. */
const feedShown = computed(() => (ui.dockTab === 'console' ? con : log));
/** Empties what is there now; the store fills again from the next line. */
function clearFeed() {
  if (ui.dockTab === 'console') live.console = []; else live.log = [];
}

/** `14:03:07.412`, the way DevTools stamps a line. */
function clock(at) {
  const d = new Date(at);
  const two = (n) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** Reopening the same page four times is one fact, not four. */
const navLines = computed(() => fold(live.navs, (a, b) =>
  a.url === b.url && a.status === b.status && a.redirects === b.redirects));
/** The Where-it-went badge: a 4xx/5xx landing or a hop off the origin is the reason to look. */
const navAlerts = computed(() => live.navs.filter((x) => x.status >= 400 || x.leftOrigin).length);

/** A count on a tab: what is wrong in red when anything is, else how many, else nothing. */
const counted = (alerts, total, title) => (alerts ? { tone: 'fail', text: alerts, title }
  : total ? { tone: 'dim', text: total } : null);
const badges = computed(() => ({
  run: runState.value,
  log: counted(log.errors, log.rows.length, plural(log.errors, 'error')),
  nav: counted(navAlerts.value, live.navs.length, `${plural(navAlerts.value, 'navigation')} worth a look`),
  console: counted(con.errors, con.rows.length, plural(con.errors, 'error')),
  script: null,
  targets: live.targets.length ? { tone: 'dim', text: live.targets.length } : null,
}));

/** The sentence beside the tabs: what the open tab is showing. */
const dockNote = computed(() => {
  if (!ui.dockOpen) return null;
  switch (ui.dockTab) {
    case 'run': return live.run ? (live.run.caseName ?? live.run.suite) : null;
    case 'log': return 'Everything the runner said while driving the page, as it happens.';
    case 'nav': return 'Every navigation the page made, with the redirects it went through.';
    case 'console': return 'What the page you are driving printed, uncaught errors included.';
    case 'script': return loaded.value ? `Loaded ${loaded.value.name}${loaded.value.suite ? ` from ${loaded.value.suite}` : ''}` : null;
    case 'targets': return live.url && live.url !== 'about:blank' ? live.url : 'nothing open';
    default: return null;
  }
});

/**
 * Drag the dock's top edge to size it, or focus it and use the arrow keys. The
 * height is kept when the drag ends rather than on every move: one gesture is
 * one write, not sixty a second.
 */
function resizeDock(e) {
  const handle = e.currentTarget;
  const from = { y: e.clientY, h: dockPanel.value?.offsetHeight ?? ui.dockHeight };
  handle.setPointerCapture(e.pointerId);
  const move = (m) => ui.sizeDock(from.h + from.y - m.clientY);
  const done = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('lostpointercapture', done);
    ui.keepDock();
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('lostpointercapture', done);
}
function nudgeDock(by) {
  ui.sizeDock((dockPanel.value?.offsetHeight ?? ui.dockHeight) + by);
  ui.keepDock();
}

/** Arrow keys move between the tabs, as they do in any tablist. */
function dockKey(by) {
  const next = DOCK_TABS[(DOCK_TABS.indexOf(ui.dockTab) + by + DOCK_TABS.length) % DOCK_TABS.length];
  ui.reveal(next);
  document.getElementById(`dock-tab-${next}`)?.focus();
}

onMounted(async () => {
  // The socket and the canvas are the Stage's, mounted first as a child, so
  // the frame the store holds is on screen before anything here is fetched.
  if (!suites.list.length) await suites.loadList();
  await loadCases();
  // Arriving with a URL means "show me this". Reloading a page the runner is
  // already on would throw away whatever is on it — a recording in progress,
  // a form half filled — for no gain, so only navigate when it is somewhere
  // else. The box still shows where you are either way.
  if (route.query.url) {
    urlBox.value = route.query.url;
    if (!sameUrl(live.url, route.query.url)) open();
  } else if (live.url && live.url !== 'about:blank') {
    // Not `about:blank`: it is truthy, so the box used to pre-fill with it and
    // pressing Open answered "Only http and https can be driven, not about:".
    urlBox.value = live.url;
  }
});

// -------------------------------------------------------------- operations
async function open() {
  error.value = null;
  if (!urlBox.value.trim()) return;
  live.needsOrigin = null;
  opening.value = urlBox.value.trim();
  live.home = opening.value;            // the page opened on purpose: what Home reopens
  live.painted = false;                 // show the loading state for the new page
  live.send({ t: 'open', url: opening.value });
}
watch(() => live.painted, (p) => { if (p) opening.value = null; });

/**
 * Back and Home. A sign-in that bounces to another origin used to leave no
 * way back: Open reopens whatever is in the box, and the box follows the
 * address only on arrival. Back is the browser's own history, offered only
 * when the runner says there is a page behind this one; Home reopens the page
 * last opened on purpose — else the ?url= this console was opened with, else
 * the suite's own address — through the same gate as Open.
 */
const homeUrl = computed(() => live.home
  ?? (route.query.url ? String(route.query.url) : null)
  ?? suite.value?.baseUrl ?? suite.value?.origin ?? null);
const goBack = () => live.send({ t: 'human.back' });
function goHome() {
  if (!homeUrl.value) return;
  urlBox.value = homeUrl.value;
  open();
}

// The console stays mounted when you move between suites, so a new ?url= has
// to be acted on — otherwise the second suite's Console button appears to do
// nothing at all.
watch(() => route.query.url, (u) => {
  if (!u || sameUrl(live.url, u)) return;
  urlBox.value = u;
  open();
});
async function allow() {
  allowing.value = true;
  try {
    const { origin, url, redirected } = live.needsOrigin;
    await api.allowOrigin(origin);
    live.needsOrigin = null;
    // A redirect prompt is about a page we are ALREADY on — reopening it would
    // throw away whatever you were doing there, recording included.
    if (url && !redirected) { urlBox.value = url; open(); }
  } catch (e) {
    // The plan's refusal is a prompt, not a red box.
    if (e.entitlement) live.upgrade = { ...e.entitlement, of: 'origin.add' };
    else error.value = e.message;
  } finally { allowing.value = false; }
}
const run = () => live.send({ t: 'command', text: script.value, pace: live.paceMs });
const record = () => live.send({ t: 'record.start' });
const stop = () => live.send({ t: 'record.stop' });
// The script lives in the dock now, so taking the recording as the script shows it there.
const useRecording = () => { script.value = live.recordedFlow; autofilled = live.recordedFlow; loaded.value = null; ui.reveal('script'); };

/**
 * What is on the page, summarised rather than tipped out.
 *
 * A marketing page has thirty-odd links and three things you would actually
 * drive, and listing all of them flat buries the three. So: grouped by role,
 * the things you type into and press first, links last — and any group past a
 * handful keeps a handful and offers the rest.
 */
const ROLE_ORDER = ['textbox', 'searchbox', 'combobox', 'checkbox', 'radio',
                    'button', 'tab', 'menuitem', 'link'];
const PER_GROUP = 6;
const openRoles = ref(new Set());
const toggleRole = (r) => { openRoles.value.has(r) ? openRoles.value.delete(r) : openRoles.value.add(r); };
const shown = (g) => (openRoles.value.has(g.role) ? g.items : g.items.slice(0, PER_GROUP));

const groups = computed(() => {
  const by = new Map();
  for (const t of live.targets) {
    if (!by.has(t.role)) by.set(t.role, []);
    by.get(t.role).push(t);
  }
  const rank = (r) => (ROLE_ORDER.indexOf(r) < 0 ? ROLE_ORDER.length : ROLE_ORDER.indexOf(r));
  return [...by.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([role, items]) => ({ role, items }));
});

async function loadCases() {
  try { cases.value = (await api.cases()).cases; } catch { cases.value = []; }
}

/** Cases grouped by their suite, for the picker's optgroups. */
const grouped = computed(() => {
  const by = new Map();
  for (const c of cases.value) {
    if (!by.has(c.suite)) by.set(c.suite, []);
    by.get(c.suite).push(c);
  }
  return [...by.entries()];
});

/** Loading a case puts its flow in the box, where you can read it before running. */
function pick(id) {
  picked.value = id;
  const c = cases.value.find((x) => x.id === id);
  if (!c) { loaded.value = null; return; }
  script.value = c.flow;
  autofilled = c.flow;          // still ours until you type in it
  loaded.value = c;
}

/**
 * The hand-off that makes teach mode worth having: recording -> stored case.
 *
 * A failure here reports NEXT TO THE BUTTON. It used to set the page-level
 * error, which renders below the log at the bottom of a long scrolling page —
 * so a refused save looked exactly like a button that did nothing, and the
 * commonest refusal is a real one worth reading: the case is validated on the
 * way in with the same parser the executor uses, and a recording made on an
 * origin nobody allowed cannot be stored.
 */
async function saveAsCase() {
  const into = saveTo.value;
  if (!into) { saveError.value = 'Choose a suite to save it into.'; return; }
  saveError.value = null; saved.value = null; saving.value = true;
  try {
    const { case: c } = await api.addCase(into, {
      name: caseName.value, flow: live.recordedFlow, source: 'recorded',
    });
    saved.value = c.name;
    await suites.loadList();
    await loadCases();          // it should be selectable straight away
    picked.value = c.id;
    loaded.value = { ...c, suite: suites.list.find((s) => s.id === into)?.name ?? into };
  } catch (e) {
    // The gate is a decision, not a dead end: offer the one action that
    // unblocks it rather than a sentence about why you cannot save.
    if (e.needsOrigin) live.needsOrigin = { origin: e.needsOrigin, redirected: true };
    saveError.value = e.message;
  } finally { saving.value = false; }
}

/**
 * One line per step, from the vocabulary rather than from a fourth opinion
 * about how a step reads.
 *
 * An action writes itself back exactly as the script spells it. The three node
 * shapes — the entry, and the url and text assertions — have no written form,
 * so they draw themselves instead, with a wider budget than a diagram cell.
 */
const cap = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));
function describe(s) {
  try { return showAction(s) ?? labelAction(s, (t, n) => cap(t, Math.max(n, 40))); }
  catch { return `${s.op} ${s.target ?? s.value ?? s.url ?? ''}`.trim(); }
}

/**
 * Keep the script box in step with the recording — until you edit it.
 *
 * This used to fill the box only while it was empty, which sounds right and is
 * exactly wrong: pressing Record immediately produces a one-step flow (the
 * goto), the box takes that, and every step you demonstrate afterwards is
 * ignored because the box is no longer empty. You would finish a four-step
 * recording and find one line in front of you.
 */
let autofilled = '';
watch(() => live.recordedFlow, (f) => {
  if (!f) return;
  if (script.value === '' || script.value === autofilled) {
    script.value = f;
    autofilled = f;
    loaded.value = null;
  }
});
</script>

<template>
  <!-- A column at least the height of the scroller, so the dock at its end
       sits on the bottom edge even when the page above it is short. -->
  <div class="flex min-h-full flex-col">
    <TopBar :crumbs="[
      ...(suite ? [{ label: 'Test suites', to: '/suites' }, { label: suite.name, to: `/suites/${suite.id}` }] : []),
      { label: 'Console' }]">
      <template #actions>
        <span class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px] text-ink-2">
          {{ live.connected ? 'Runner connected' : 'Runner offline' }}
        </span>
      </template>
    </TopBar>

    <!-- minmax(0,1fr) below xl too: a bare `grid` sizes its one column to the
         widest unbreakable thing inside it, and a one-line URL is one. -->
    <div class="grid flex-1 content-start grid-cols-[minmax(0,1fr)] gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <!-- stage -------------------------------------------------------- -->
      <div class="min-w-0">
        <!-- The chrome the canvas does not have. A video of a browser shows you
             the page and nothing about where it is; this is the address bar. -->
        <AddressBar :url="live.url" :nav="live.currentNav" />

        <Stage :opening="opening" />

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <Btn variant="ghost" :disabled="!live.back || live.running"
               :title="live.back ? 'Back to the page before this one' : 'Nothing to go back to'" @click="goBack">Back</Btn>
          <Btn variant="ghost" :disabled="!homeUrl"
               :title="homeUrl ? `Reopen ${homeUrl}` : 'Nothing has been opened from here yet'" @click="goHome">Home</Btn>
          <input v-model="urlBox" spellcheck="false" aria-label="URL to open"
                 placeholder="staging.acme.com/dashboard"
                 class="min-w-0 grow basis-40 rounded-full border border-hairline bg-panel px-4 py-2 text-[13.5px] outline-none focus:border-ink/25"
                 @keyup.enter="open">
          <Btn :busy="!!opening" busy-label="Opening…" @click="open">Open</Btn>
          <Btn variant="ghost" @click="live.send({ t: 'inspect' })">Re-scan</Btn>
          <button v-if="!live.recording" class="rounded-full border border-critical/40 px-4 py-2 text-[13px] text-critical"
                  :disabled="live.running" @click="record">● Record</button>
          <button v-else class="rounded-full bg-critical px-4 py-2 text-[13px] font-medium text-white" @click="stop">■ Stop</button>
        </div>

        <p class="mt-2 text-[12.5px] text-ink-3">
          Point at the page above and use your wheel or trackpad to scroll it — or the buttons.
          Clicking and typing there go to the page you are driving, never to this one. Back is the
          browser's own; Home reopens the page you last opened.
        </p>

        <UpgradePrompt v-if="live.upgrade" class="mt-3" :limit="live.upgrade.limit" :plan="live.upgrade.plan" @dismiss="live.upgrade = null" />

        <div v-if="live.needsOrigin" class="mt-3 card wash-warm p-4">
          <p class="text-[13.5px] font-medium">{{ live.needsOrigin.origin }} is not allowed yet.</p>
          <p v-if="live.needsOrigin.redirected" class="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
            The page you opened redirected here. A different host or scheme is a different
            origin — allowing <code>example.com</code> does not allow <code>www.example.com</code> —
            so anything you record on this page will refuse to replay until you allow it too.
          </p>
          <p v-else class="mt-1 text-[13px] text-ink-2">The gate only opens for a person. Nothing generated can reach this button.</p>
          <div class="mt-3 flex gap-2">
            <Btn :busy="allowing" busy-label="Allowing…" @click="allow">
              {{ live.needsOrigin.url && !live.needsOrigin.redirected ? 'Allow it and open' : 'Allow it' }}
            </Btn>
            <button class="rounded-full border border-hairline px-4 py-2 text-[13px]" @click="live.needsOrigin = null">Cancel</button>
          </div>
        </div>
      </div>

      <!-- rail: the recording, beside the page it is a recording of --------- -->
      <!-- Always drawn, empty or not, so the page keeps its shape: the one
           thing that is not a tab is the one that reads best alongside the
           canvas as the steps land. -->
      <aside class="min-w-0">
        <section class="card p-5">
          <div class="flex items-center gap-2">
            <h2 class="text-[15px] font-medium">Recording</h2>
            <span v-if="live.recording" class="size-1.5 animate-pulse rounded-full bg-critical" />
            <span v-if="live.recording || live.recordedCount" class="ml-auto text-[12.5px] text-ink-3">{{ live.recordedCount }} steps</span>
          </div>
          <template v-if="live.recording || live.recordedCount">
            <p class="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              Drive the page on the canvas. A typed password is dropped here and written as a vault
              reference — it never reaches this script, the log, or the diagram.
            </p>
            <FlowBox :model-value="live.recordedFlow" :rows="12" readonly class="mt-3" />
            <div class="mt-3 flex gap-2">
              <button class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px]" @click="useRecording">
                Use as script
              </button>
            </div>

            <!--
              A recording is worth keeping wherever it was made. The console
              opened from a suite fills the suite in; opened on its own it asks
              which one, rather than telling you to go and open it again.
            -->
            <div v-if="live.recordedFlow" class="mt-4 border-t border-hairline pt-4">
              <Field v-if="!suiteId" label="Save into"
                     :hint="suites.list.length ? 'Any suite you have.' : 'No suites yet — onboard a project first.'">
                <select v-model="saveTo">
                  <option :value="null">Choose a suite…</option>
                  <option v-for="s in suites.list" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </Field>
              <Field label="Save into this suite" :hint="`Goes to ${suite?.name ?? suiteId} as a case.`" v-else>
                <input v-model="caseName" placeholder="Sign in works" @keyup.enter="saveAsCase">
              </Field>
              <Field v-if="!suiteId" label="Name it" hint="What this case proves.">
                <input v-model="caseName" placeholder="Sign in works" @keyup.enter="saveAsCase">
              </Field>
              <Btn class="mt-3" :busy="saving" busy-label="Saving…" :disabled="!saveTo" @click="saveAsCase">Save as a case</Btn>
              <p v-if="saved" class="mt-2 text-[12.5px] text-good">Saved “{{ saved }}”.</p>
              <p v-if="saveError"
                 class="mt-2 rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">
                {{ saveError }}
              </p>
            </div>
          </template>
          <p v-else class="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
            Nothing recorded yet. Press <b class="font-medium text-ink">● Record</b> under the page and
            drive it — every step you demonstrate lands here as a script, to use or to save as a case.
          </p>
        </section>
      </aside>
    </div>

    <p v-if="error" class="mx-6 mb-6 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">
      {{ error }}
    </p>

    <!-- dock ---------------------------------------------------------- -->
    <!-- Last in the page and sticky to the bottom of <main> rather than fixed:
         always in reach while you scroll, but scrolled to the end it sets down
         under the last card instead of covering it. -->
    <section class="sticky bottom-0 z-10 border-t border-hairline bg-panel shadow-[0_-8px_24px_-16px_rgb(16_16_20/0.25)]"
             aria-label="Run, log, where it went, console, script and what is on the page">
      <div v-if="ui.dockOpen" role="separator" aria-orientation="horizontal" tabindex="0"
           aria-label="Resize the panel" :aria-valuenow="ui.dockHeight" aria-valuemin="96" title="Drag to resize"
           class="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize touch-none hover:bg-brand/25 focus-visible:bg-brand/35 focus-visible:outline-none"
           @pointerdown.prevent="resizeDock" @keydown.up.prevent="nudgeDock(24)" @keydown.down.prevent="nudgeDock(-24)" />

      <div class="flex items-center gap-2 px-6">
        <!-- Six tabs are wider than a phone: the strip scrolls sideways there
             rather than wrapping into two rows or squeezing the canvas. -->
        <div role="tablist" aria-label="Panel" class="flex min-w-0 shrink items-center gap-1 overflow-x-auto [scrollbar-width:none]"
             @keydown.left.prevent="dockKey(-1)" @keydown.right.prevent="dockKey(1)">
          <button v-for="id in DOCK_TABS" :id="`dock-tab-${id}`" :key="id" type="button" role="tab" aria-controls="dock-panel"
                  :aria-selected="ui.dockTab === id" :tabindex="ui.dockTab === id ? 0 : -1"
                  class="flex items-center gap-2 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[13px]"
                  :class="ui.dockOpen && ui.dockTab === id ? 'border-brand font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink'"
                  @click="ui.showDock(id)">
            {{ LABELS[id] }}
            <template v-if="badges[id]">
              <span v-if="badges[id].tone === 'dim'" class="text-[11.5px] tabular-nums text-ink-3">{{ badges[id].text }}</span>
              <span v-else class="flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums"
                    :class="TONE[badges[id].tone]" :title="badges[id].title">
                <span v-if="badges[id].tone === 'live'" class="size-1.5 animate-pulse rounded-full bg-brand" />
                {{ badges[id].text }}
              </span>
            </template>
          </button>
        </div>

        <p v-if="dockNote" class="ml-2 min-w-0 truncate text-[12.5px] text-ink-3" :class="ui.dockTab !== 'run' && 'hidden md:block'"
           :title="ui.dockTab === 'run' && live.run?.caseName ? `${live.run.suite} — ${live.run.caseName}` : dockNote">
          {{ dockNote }}
        </p>

        <div class="ml-auto flex shrink-0 items-center gap-1">
          <button v-if="ui.dockOpen && (ui.dockTab === 'log' || ui.dockTab === 'console') && feedShown.rows.length" type="button"
                  class="rounded-md px-2 py-1 text-[12.5px] text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
                  @click="clearFeed">Clear</button>
          <button type="button" :aria-expanded="ui.dockOpen" aria-controls="dock-panel"
                  :aria-label="ui.dockOpen ? 'Hide the panel' : 'Show the panel'"
                  :title="ui.dockOpen ? 'Hide the panel' : 'Show the panel'"
                  class="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
                  @click="ui.toggleDock()">
            <svg viewBox="0 0 16 16" class="size-4 transition-transform" :class="!ui.dockOpen && 'rotate-180'"
                 fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4.5 6.5 8 10l3.5-3.5" />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="ui.dockOpen" id="dock-panel" ref="dockPanel" role="tabpanel"
           :aria-labelledby="`dock-tab-${ui.dockTab}`"
           class="relative flex max-h-[60vh] flex-col border-t border-hairline"
           :style="{ height: `${ui.dockHeight}px` }">
        <!-- run: every step as it lands, the running one followed ------ -->
        <div v-if="ui.dockTab === 'run'" ref="runList"
             class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-3" @scroll.passive="onRunScroll">
          <ol v-if="live.run" class="space-y-1 font-mono text-[12px]">
            <li v-for="s in live.run.steps" :key="s.i" :data-state="s.state" class="flex gap-2 rounded px-1"
                :class="s.state === 'run' && 'bg-brand-50'">
              <span class="w-5 shrink-0 text-right text-ink-3">{{ s.i }}</span>
              <span class="w-4 shrink-0" :class="{ 'text-good': s.state === 'pass', 'text-critical': s.state === 'fail' }">
                {{ { pass: '✓', fail: '✕', run: '·', idle: ' ' }[s.state] }}
              </span>
              <div class="min-w-0 flex-1" :class="s.state === 'fail' ? 'text-critical' : 'text-ink-2'">
                {{ s.step ? describe(s.step) : '' }}
                <span v-if="s.error" class="block whitespace-pre-wrap text-ink-2">{{ s.error }}</span>
              </div>
              <span v-if="s.ms !== null" class="shrink-0 tabular-nums text-ink-3">{{ s.ms }}ms</span>
            </li>
          </ol>
          <p v-else class="text-[12.5px] text-ink-3">
            No run yet. Press <b class="font-medium text-ink-2">Run script</b> on the Script tab and each step lands here as it happens.
          </p>
        </div>

        <!-- log and console: the runner's lines, or the page's ---------- -->
        <template v-else-if="ui.dockTab === 'log' || ui.dockTab === 'console'">
          <!-- DevTools' filter bar, cut down to what a failing step needs:
               which levels, and a word to find. -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-6 py-1.5">
            <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Levels">
              <button type="button" class="rounded-md px-2 py-0.5 text-[12px]" :aria-pressed="!feedShown.levels.length"
                      :class="!feedShown.levels.length ? 'bg-ink/[0.07] font-medium text-ink' : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink'"
                      @click="feedShown.levels = []">All levels</button>
              <button v-for="level in LEVELS" :key="level" type="button" :aria-pressed="feedShown.levels.includes(level)"
                      class="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px]"
                      :class="feedShown.levels.includes(level) ? LEVEL_ON[level] : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink'"
                      @click="feedShown.toggle(level)">
                {{ LEVEL_NAMES[level] }}
                <span class="tabular-nums" :class="feedShown.counts[level] ? LEVEL_TEXT[level] : 'text-ink-3/60'">{{ feedShown.counts[level] }}</span>
              </button>
            </div>
            <input v-model="feedShown.query" type="search" placeholder="Filter text" spellcheck="false"
                   :aria-label="`Filter the ${ui.dockTab === 'console' ? 'console' : 'log'} by text`"
                   class="ml-auto w-48 min-w-0 rounded-md border border-hairline bg-ground px-2 py-0.5 text-[12px] outline-none focus:border-ink/25">
          </div>

          <div class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ol class="font-mono text-[11.5px]">
              <li v-for="l in feedShown.shown" :key="l.id" :data-level="l.level"
                  class="flex items-baseline gap-2.5 border-b border-hairline/70 px-6 py-[3px]" :class="ROW_TINT[l.level]">
                <span v-if="l.at" class="shrink-0 tabular-nums text-ink-3">{{ clock(l.at) }}</span>
                <span class="w-10 shrink-0 text-[10.5px] font-semibold uppercase" :class="LEVEL_TEXT[l.level]">{{ l.said === 'log' ? 'log' : l.level }}</span>
                <span class="min-w-0 grow whitespace-pre-wrap break-words" :class="ROW_TEXT[l.level]">{{ l.text }}</span>
                <span v-if="l.n > 1" class="shrink-0 rounded bg-ink/[0.07] px-1.5 text-[10.5px] text-ink-2"
                      :title="`${ui.dockTab === 'console' ? 'printed' : 'said'} ${l.n} times in a row`">×{{ l.n }}</span>
              </li>
            </ol>
            <p v-if="!feedShown.shown.length" class="px-6 py-3 text-[12.5px] text-ink-3">
              {{ feedShown.rows.length ? 'Nothing matches this filter.'
                : ui.dockTab === 'console'
                  ? 'Nothing printed yet. Anything the page logs — including an uncaught error — lands here.'
                  : 'Nothing yet. Everything the runner says while driving the page lands here as it happens.' }}
            </p>
          </div>
        </template>

        <!-- where it went: every navigation, with the hops it went through -->
        <!-- The final URL says nothing about a 301 through a dead path, a
             detour via a tracker, or a friendly 404 — and none of those is
             visible anywhere else. -->
        <div v-else-if="ui.dockTab === 'nav'" class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ol v-if="navLines.length" class="font-mono text-[11.5px]">
            <li v-for="x in navLines" :key="x.id" class="border-b border-hairline/70 px-6 py-2">
              <p class="flex items-center gap-2">
                <span class="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
                      :class="x.status >= 400 ? 'bg-critical/10 text-critical'
                            : x.redirects ? 'bg-warn/10 text-warn' : 'bg-ink/5 text-ink-2'">{{ x.status }}</span>
                <span v-if="x.redirects" class="shrink-0 text-ink-2">
                  {{ x.redirects }} redirect{{ x.redirects === 1 ? '' : 's' }}
                </span>
                <span v-if="x.leftOrigin" class="shrink-0 text-critical">left the origin</span>
                <span class="min-w-0 truncate text-ink" :title="x.url">{{ x.url }}</span>
                <span v-if="x.n > 1" class="ml-auto shrink-0 rounded bg-ink/[0.07] px-1.5 text-[10.5px] text-ink-2"
                      :title="`opened ${x.n} times in a row`">×{{ x.n }}</span>
              </p>
              <ol v-if="x.redirects" class="mt-1 space-y-0.5">
                <li v-for="(h, i) in x.hops" :key="i" class="flex gap-2 text-[10.5px] text-ink-3">
                  <span class="w-7 shrink-0 text-right">{{ h.status }}</span>
                  <span class="truncate" :title="h.url">{{ h.url }}</span>
                </li>
              </ol>
            </li>
          </ol>
          <p v-else class="px-6 py-3 text-[12.5px] text-ink-3">
            Nothing yet. Every navigation the page makes lands here — with the redirects it went through, and whether it left the origin.
          </p>
        </div>

        <!-- script: what to run, and the button that runs it ------------ -->
        <div v-else-if="ui.dockTab === 'script'" class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-3">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-[13px] text-ink-3">Flow language, or one instruction per line.</span>

            <!-- A saved case is the usual thing you want to run here, so it is one
                 control away rather than a trip through the sidebar. -->
            <!-- Read the value off the event, not off v-model: both handlers fire on
                 the same change and v-model does not reliably win the race, so
                 `picked` can still hold the previous selection when this runs. -->
            <select v-if="cases.length" :value="picked" @change="pick($event.target.value)"
                    class="ml-auto max-w-64 rounded-full border border-hairline bg-panel px-3.5 py-1.5 text-[13px] outline-none focus:border-ink/25">
              <option value="">Load a saved case…</option>
              <optgroup v-for="[suiteName, rows] in grouped" :key="suiteName" :label="suiteName">
                <option v-for="c in rows" :key="c.id" :value="c.id">
                  {{ c.name }} · {{ c.steps }} step{{ c.steps === 1 ? '' : 's' }}
                </option>
              </optgroup>
            </select>

            <!-- How much of the run is performed for you.
                 A replay glides the pointer, pauses before each click and types a
                 character at a time, so that a feed running at roughly ten frames
                 a second shows something a person can follow. That is about two
                 thirds of a second per click step, and it is worth nothing at all
                 when you are not watching. -->
            <div :class="['flex overflow-hidden rounded-full border border-hairline', !cases.length && 'ml-auto']"
                 role="group" aria-label="Run speed">
              <button v-for="p in [['watch', 'Watch'], ['fast', 'Fast']]" :key="p[0]"
                      class="px-3 py-1.5 text-[12.5px]"
                      :class="live.pace === p[0] ? 'bg-brand-50 font-medium text-brand-2' : 'text-ink-3 hover:bg-ink/[0.04]'"
                      :aria-pressed="live.pace === p[0]"
                      :title="p[0] === 'watch'
                        ? 'Glide the pointer and pause, so a run can be followed'
                        : 'No performance — as fast as the page allows'"
                      @click="live.setPace(p[0])">{{ p[1] }}</button>
            </div>

            <Btn :busy="live.running" busy-label="Running…"
                 :disabled="!script.trim()" @click="run">Run script</Btn>
          </div>
          <p v-if="loaded" class="mt-2 flex items-center gap-2 text-[12.5px] text-ink-3">
            Loaded <b class="font-medium text-ink">{{ loaded.name }}</b>
            <template v-if="loaded.suite">from {{ loaded.suite }}</template>
            <button class="underline hover:text-ink" @click="script = ''; loaded = null; picked = ''">clear</button>
          </p>
          <FlowBox v-model="script" :rows="8" class="mt-3" />
        </div>

        <!-- on this page: the page's controls, grouped by what they are --- -->
        <div v-else class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-3">
          <div class="flex items-center gap-2">
            <p class="min-w-0 truncate font-mono text-[11.5px] text-ink-3">
              {{ live.url && live.url !== 'about:blank' ? live.url : 'nothing open' }}
            </p>
            <!-- The list refreshes itself when the page changes shape; this is
                 for the time it did not, so it lives beside the list too. -->
            <button type="button" class="ml-auto shrink-0 rounded-full border border-hairline px-2.5 py-0.5 text-[11.5px] text-ink-3 hover:border-ink/25 hover:text-ink"
                    title="Read the page's controls again — the list normally refreshes on its own"
                    @click="live.send({ t: 'inspect' })">Re-scan</button>
          </div>

          <div v-for="g in groups" :key="g.role" class="mt-3">
            <p class="eyebrow mb-1.5">{{ plural(g.items.length, g.role) }}</p>
            <div class="flex flex-wrap gap-1.5">
              <!-- The role is the group's heading, so the chip is just the name —
                   which is what you are scanning for. -->
              <button v-for="t in shown(g)" :key="t.target"
                      class="max-w-[13rem] truncate rounded-full border border-hairline px-2.5 py-1 text-[12px]
                             hover:border-ink/30"
                      :title="`Insert ${t.target}`"
                      @click="script += `${script && !script.endsWith('\n') ? '\n' : ''}click ${t.target}\n`">
                {{ t.name }}
              </button>
              <button v-if="g.items.length > PER_GROUP" @click="toggleRole(g.role)"
                      class="rounded-full px-2.5 py-1 text-[12px] text-brand-2 hover:bg-brand-50">
                {{ openRoles.has(g.role) ? 'Show fewer' : `+${g.items.length - PER_GROUP} more` }}
              </button>
            </div>
          </div>
          <p v-if="!live.targets.length" class="mt-3 text-[12.5px] text-ink-3">
            Nothing interactive found here yet.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
