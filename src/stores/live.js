/**
 * The live session: one WebSocket, one store, every view.
 *
 * There is exactly one driven browser, so there is exactly one of these. A
 * second socket would mean a second screencast subscriber and two views of the
 * same run that can disagree — so the store is a singleton and views read from
 * it rather than opening their own.
 *
 * Binary messages are screencast frames; text messages are events. Frames are
 * handed to whoever registered `onFrame` (the console's canvas), and the most
 * recent one is KEPT even when nobody is looking.
 *
 * That last part is not an optimisation, it is the fix for a black canvas.
 * Chrome's screencast is damage-driven: a page that is sitting still emits
 * nothing at all. The server primes each new socket with one frame, but the
 * socket opens when the app loads and the canvas only exists once you navigate
 * to the console — so that frame arrived, found no canvas, and was dropped.
 * Open the console on an idle page and you would wait forever for a second
 * frame that was never coming.
 */
import { defineStore } from 'pinia';
import { hasAuth, wsUrl } from '@/config';
import { api } from '@/api';
import { useSession } from '@/stores/session';
import { addFix } from '@/fixes';
import { endThinking, thinkingOn } from '@/thinking';
import { traceOn } from '@/reasoning';
import { fixMessage, notesOn } from '@/stepnotes';

const MAX_LOG = 200;
/** The page's console keeps more: there every line is the point, and a chatty page prints 200 in a second. */
const MAX_CONSOLE = 1000;
/**
 * Arrival order across the runner's log and the page's console, which the dock
 * merges into one stream. A timestamp cannot keep it: the runner's line and the
 * page's line routinely land in the same millisecond.
 */
let arrival = 0;
/** Incidents kept in memory; the runner keeps the same number on disk. */
const MAX_INCIDENTS = 200;
/** Replace an item by id in place, or put a new one first. */
function upsert(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) list.unshift(item); else list.splice(i, 1, item);
}
/**
 * Reconnect timing. Fast at first — the server restarts often while you are
 * working on it — and doubling up to thirty seconds, so a runner that is down
 * for lunch is asked once every half minute rather than fifty times a minute,
 * each of which would mint a token and buy a ticket [session-4].
 */
const RECONNECT_MIN_MS = 1200;
const RECONNECT_MAX_MS = 30_000;

export const useLive = defineStore('live', {
  state: () => ({
    connected: false,
    url: null,
    origins: [],
    secrets: [],        // filled by a `secrets` reply, never by the greeting
    org: null,          // which organisation this socket is, as the runner sees it
    /**
     * Who is driving the one browser (docs/AUTH.md §10): `org` is whose page
     * is on it, `held` whether they still hold the lock, `mine` whether it is
     * us. Not ours means the canvas shows nothing and the runner says so.
     */
    driving: { org: null, held: false, mine: true },
    // The plan said no: {limit, plan, of}. A view turns it into an upgrade
    // prompt rather than a red box, and clears it when dismissed.
    upgrade: null,
    /**
     * The operator's switches for the runner (docs/HARDENING.md), from the
     * greeting: { 'runner.recording': true, … }. A key that is missing counts
     * as ON, so a runner too old to send any turns nothing off in the UI.
     */
    switches: {},
    /**
     * Automatic fixes, as the runner applies them to THIS organisation:
     * { mode: 'off'|'safe'|'ai', ai: { enabled, available, reason }, canManage }.
     * From the greeting, and replaced whenever Settings changes the opt-in.
     * Null until a runner that knows about fixes says so — which reads as off.
     */
    heal: null,
    /**
     * How many suggested fixes this organisation has waiting, pushed by the
     * runner whenever that number changes. Null until the first push: not
     * knowing is not zero, and a view that wants the list asks for it anyway.
     */
    fixesPending: null,
    targets: [],
    running: false,
    recording: false,
    recordedFlow: '',
    recordedCount: 0,
    /**
     * What the runner worked out about each recorded step (stepnotes.js), and
     * the revision of the recording they belong to: once a step is taken out,
     * every index after it moves, so notes from another revision are not drawn.
     */
    recordNotes: [],
    recordRev: null,
    // The run in progress, as the steps report themselves.
    run: null,          // { suite, total, ok, fixed, steps: [{i, state, ms, error, fixes, thinking, trace}] }
    suiteRun: null,     // { suite, cases, done, passed }
    log: [],
    cursor: { x: 0, y: 0 },
    ripple: 0,
    needsOrigin: null,
    navs: [],           // recent navigations, newest first
    console: [],        // the DRIVEN page's console, oldest first
    consoleSince: 0,    // the dock's Clear: lines that arrived before this are not shown
    /**
     * How much of a run to perform: 'watch' is the server's own pace, 'fast'
     * removes the performance entirely.
     *
     * Kept here rather than in a view because two different paths start runs —
     * the console over the socket, a suite over HTTP — and a setting that only
     * one of them honoured would be worse than not having it.
     *
     * Per-viewer and remembered, so choosing it once is choosing it. It is not
     * shared state: two people watching the same runner can legitimately
     * disagree about whether they want to watch.
     */
    pace: (() => { try { return localStorage.getItem('gc.pace') === 'fast' ? 'fast' : 'watch'; } catch { return 'watch'; } })(),
    diagram: null,
    ws: null,
    onFrame: null,      // set by the console view while it is mounted
    lastFrame: null,    // held for whoever attaches next
    painted: false,     // has a canvas actually drawn one?
    backoff: RECONNECT_MIN_MS,   // the next reconnect delay; reset on a clean open
    reconnectTimer: null,
    wanted: false,      // did someone ask for a socket? off after disconnect()
    /**
     * Agentic monitoring — the runner's, mirrored. REST loads the lists
     * (loadMonitoring) and the socket keeps them current. `picking` is never
     * set optimistically: the runner refuses to pick while a run or a
     * recording holds the page or the browser is another organisation's, and
     * the refusal arrives as `refused` — a button that flipped itself would
     * lie for a round trip and then snap back.
     */
    monitors: [],       // PublicMonitor, newest first
    incidents: [],      // Incident, newest first, capped
    picking: false,     // the runner's picker is armed on the page
    picked: null,       // { selector, fingerprint, snapshot, label, url } from monitor.selected
    pickError: null,    // a sentence for the Pick button, from a refusal
    monitoring: null,   // the /api/monitoring summary: { llm, budget, counts, picking }
    /**
     * Help & support (support.js): whether support access is on for this
     * organisation, as the runner last said. Loaded once the socket is up and
     * kept current by the `support` event every request or switch-off sends.
     */
    support: { enabled: false, since: null },
  }),

  getters: {
    // A run is finished when every step has a verdict or one of them failed.
    lastError: (s) => s.run?.steps.find((x) => x.state === 'fail')?.error ?? null,
    /** Another organisation has the browser right now. */
    busy: (s) => s.connected && !!s.driving.org && !s.driving.mine && s.driving.held,
    /**
     * What to send with a run. `undefined` for 'watch' rather than a number:
     * the server's own default is the right answer and it may not be 420.
     */
    paceMs: (s) => (s.pace === 'fast' ? 0 : undefined),
    /** Open incidents, for the sidebar's dot and the monitoring page's count. */
    openIncidents: (s) => s.incidents.filter((i) => i.status === 'open').length,
    /**
     * The navigation that produced the address we are showing — or none.
     *
     * Matched on the URL rather than just taking the newest chain, because they
     * can legitimately disagree: a hash change or a pushState navigates without
     * producing a document, so no chain is recorded for it and the newest one
     * is still the load that got you to the page. Comparing without the hash
     * keeps that chain attached where it belongs, and stops a stale one being
     * shown beside an address it did not produce — which would claim a redirect
     * that never happened. Here rather than in a view, because the console and
     * the monitoring page both draw the address bar.
     */
    currentNav: (s) => {
      if (!s.url || s.url === 'about:blank') return null;
      const withoutHash = (u) => { try { const x = new URL(u); x.hash = ''; return x.href; } catch { return u; } };
      const here = withoutHash(s.url);
      return s.navs.find((n) => n.url && withoutHash(n.url) === here) ?? null;
    },
  },

  actions: {
    /**
     * Open the socket — with a ticket, if there is a control plane.
     *
     * A browser cannot set headers on a WebSocket, so whatever proves who is
     * connecting has to ride in the URL, and a URL is what logs and history
     * keep. So the TOKEN never goes there. It buys a ticket over a Bearer
     * header instead — thirty seconds, one use, bound to the token's claims —
     * and the ticket is what opens the socket (docs/AUTH.md §9). A `?t=` in
     * the socket URL is refused by the runner, on purpose.
     *
     * Async, and done EVERY time rather than once at startup: the ticket is
     * single-use, the token behind it lasts ten minutes, and the runner closes
     * the socket when that token expires — so each reconnect is a fresh ticket
     * from a fresh-enough token, and a console after a lunch break comes back
     * rather than sitting on "connecting" with nothing saying why.
     */
    async connect() {
      this.wanted = true;
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      if (this.ws && this.ws.readyState <= 1) return;

      let ticket = null;
      if (hasAuth()) {
        try { ticket = (await api.socketTicket()).ticket; }
        catch (err) {
          // Signed out, the control plane is down, or the token was refused.
          // A terminal 401 from the control plane has already routed to the
          // login page by now (session.js); anything else is worth another
          // try later, and nothing is gained by opening a socket that the
          // runner will only refuse.
          if (this.wanted && useSession().signedIn) this.scheduleReconnect();
          return;
        }
      }

      // Re-check: awaiting above yields, and a second caller may have opened
      // one in the meantime. Two sockets means two screencast subscribers.
      if (!this.wanted) return;
      if (this.ws && this.ws.readyState <= 1) return;

      const ws = new WebSocket(wsUrl('/ws') + (ticket ? `?ticket=${encodeURIComponent(ticket)}` : ''));
      ws.binaryType = 'blob';
      this.ws = ws;

      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.connected = true;
        this.backoff = RECONNECT_MIN_MS;    // a clean open earns a fast retry next time
        // A reconnect starts with no picture, and the page may be idle.
        this.send({ t: 'frame.request' });
      };
      ws.onclose = (e) => {
        this.connected = false;
        // We no longer know what the executor is doing; `ready` will say.
        this.running = false;
        // Nor what it is thinking: a `done` sent while we were away never
        // arrives, and a row saying "Working out what changed… 94s" for a run
        // that ended during the outage is a hang that is not happening.
        if (this.run) this.run.steps = this.run.steps.map(endThinking);
        // Nor whether the picker is armed on a page we cannot see.
        this.picking = false;
        this.pickError = null;
        if (this.ws === ws) this.ws = null;
        // 4401 is the runner closing the socket because the token that
        // bought its ticket has expired. The token is spent; forget it so
        // the next ticket is bought with a fresh one, and reconnect at once
        // rather than backing off — nothing is wrong, it is the clock.
        if (e?.code === 4401) { useSession().forgetToken(); this.backoff = RECONNECT_MIN_MS; }
        // Only when the upgrade was REFUSED — a socket that opened and later
        // dropped is a restarted runner, not a bad token. Forgetting on every
        // close would mint a new token against the control plane on every
        // retry for as long as the runner is down.
        else if (!opened) useSession().forgetToken();
        // The server restarts often while you are working on it. Reconnecting
        // quietly beats a page that looks broken until you reload it — unless
        // disconnect() said not to, which is sign-out.
        if (this.wanted) this.scheduleReconnect();
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') {
          this.lastFrame = e.data;
          return void this.onFrame?.(e.data);
        }
        let ev; try { ev = JSON.parse(e.data); } catch { return; }
        this.handle(ev);
      };
    },

    scheduleReconnect() {
      if (this.reconnectTimer) return;
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
      this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
    },

    /**
     * Close the socket and stop reconnecting: sign-out, and the moment before
     * a new sign-in. The runner drops a socket that says goodbye at once
     * rather than leaving it to time out, so the next person to sign in on
     * this page is not still attached as the previous one [session-3].
     */
    disconnect() {
      this.wanted = false;
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      this.backoff = RECONNECT_MIN_MS;
      const ws = this.ws;
      this.ws = null;
      if (ws && ws.readyState <= 1) {
        try { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'bye' })); } catch { /* already going */ }
        try { ws.close(1000, 'bye'); } catch { /* already gone */ }
      }
      this.connected = false;
      this.running = false;
      this.forgetNotes();
      this.picking = false;
      this.pickError = null;
    },

    send(msg) {
      if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
    },

    /** Apply the fix a recorded step's note offers (stepnotes.js) — on the revision it was offered on, and no other. */
    fixRecordedStep(note) {
      if (note?.concern?.fix && typeof this.recordRev === 'number') this.send(fixMessage(note, this.recordRev));
    },

    /**
     * Forget what is known about a recording's steps, and its revision, so no
     * note is drawn beside steps it is not about — and no fix can be sent for
     * them — until the runner says what the recording is now.
     */
    forgetNotes() {
      this.recordNotes = [];
      this.recordRev = null;
    },

    setPace(pace) {
      this.pace = pace === 'fast' ? 'fast' : 'watch';
      try { localStorage.setItem('gc.pace', this.pace); } catch { /* private window */ }
    },

    /**
     * A canvas is ready. Give it the frame we already have, if any, and ask
     * the server for a fresh one — the page may not have moved since.
     */
    attachCanvas(fn) {
      this.onFrame = fn;
      if (this.lastFrame) fn(this.lastFrame);
      this.send({ t: 'frame.request' });
    },

    detachCanvas() {
      this.onFrame = null;
      this.painted = false;
    },

    // ---- agentic monitoring
    upsertMonitor(m) { if (m?.id) upsert(this.monitors, m); },
    upsertIncident(i) {
      if (!i?.id) return;
      upsert(this.incidents, i);
      if (this.incidents.length > MAX_INCIDENTS) this.incidents.length = MAX_INCIDENTS;
    },
    dropMonitor(id) {
      this.monitors = this.monitors.filter((m) => m.id !== id);
      // The runner dropped its incidents with it; so does this page.
      this.incidents = this.incidents.filter((i) => i.monitorId !== id);
    },
    /**
     * The monitoring page's lists, from the runner. A `monitor.changed` that
     * lands between the runner answering and these assignments is overwritten;
     * the next tick or change repairs it, and a REST answer that is a moment
     * old is what a page load shows anyway.
     */
    async loadMonitoring() {
      const [m, i] = await Promise.all([api.monitors(), api.incidents()]);
      this.monitors = m.monitors ?? [];
      this.incidents = (i.incidents ?? []).slice(0, MAX_INCIDENTS);
      // The summary is the badge in the top bar; a failure there is not a failure of the page.
      this.monitoring = await api.monitoring().catch(() => null);
      if (this.monitoring) this.picking = !!this.monitoring.picking;
    },
    /** Whether support access is on, from the runner; the top bar's pill draws it. */
    async loadSupport() {
      try {
        const s = await api.support();
        this.support = { enabled: !!s.enabled, since: s.since ?? null };
      } catch { /* the pill stays off until the runner answers */ }
    },
    /** The open incidents alone — the sidebar's dot, right before the page has been visited. */
    async loadOpenIncidents() {
      try {
        for (const inc of (await api.incidents('open')).incidents ?? []) upsert(this.incidents, inc);
      } catch { /* the dot stays off until the page is visited */ }
    },

    say(msg, level = 'info') {
      this.log.unshift({ id: `${Date.now()}-${Math.random()}`, seq: ++arrival, at: Date.now(), level, msg });
      if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
    },

    handle(ev) {
      switch (ev.t) {
        case 'ready':
          // The greeting names the organisation and its origins and says who
          // is driving; the URL is there only when the page is ours, and the
          // vault's key names never are (they come from /api/state).
          this.url = ev.url; this.origins = ev.origins;
          // Another organisation's socket (an org switch reconnects with a
          // new ticket): its monitors are not ours to show.
          if (this.org && ev.org && this.org !== ev.org) { this.monitors = []; this.incidents = []; this.picked = null; this.monitoring = null; }
          this.org = ev.org ?? null;
          if ('picking' in ev) this.picking = !!ev.picking;
          if (ev.url === null) this.picked = null;
          if (ev.driving) this.driving = ev.driving;
          if (ev.url === null) { this.targets = []; this.lastFrame = null; this.painted = false; }
          // Trust the server over whatever we last saw. A socket that dropped
          // mid-run never received run.end, so `running` stayed true here and
          // the Run button was disabled until someone reloaded the page.
          this.running = !!ev.running;
          this.recording = !!ev.recording;
          this.switches = ev.switches ?? {};
          this.heal = ev.heal ?? null;
          // A greeting carries no revision, and a `recorded` event may have gone
          // by while the socket was away: notes kept from before could be about
          // other steps, or say Thinking… forever. The next `recorded` brings them.
          this.forgetNotes();
          break;
        // The browser changed hands, or was let go. When it is no longer ours
        // the page on it is someone else's: forget the address, the targets
        // and the last picture rather than keep showing them.
        case 'driving':
          this.driving = { org: ev.org ?? null, held: !!ev.held, mine: !!ev.mine };
          if (!ev.mine) { this.url = null; this.targets = []; this.lastFrame = null; this.painted = false; this.running = false; this.forgetNotes(); }
          if (!ev.mine) { this.url = null; this.targets = []; this.lastFrame = null; this.painted = false; this.running = false; this.picking = false; this.picked = null; }
          break;
        case 'origins': this.origins = ev.origins; break;
        case 'secrets': this.secrets = ev.secrets; break;
        // Cheap and immediate; `targets` carries the same URL but arrives
        // after discovery, which is far too late for an address bar.
        case 'url': this.url = ev.url; break;
        case 'targets': this.url = ev.url; this.targets = ev.items; break;
        case 'cursor': this.cursor = { x: ev.x, y: ev.y }; break;
        case 'press': this.ripple++; break;
        case 'diagram': this.diagram = ev.mermaid; break;
        case 'needs.origin':
          this.needsOrigin = { origin: ev.origin, url: ev.url, redirected: ev.redirected };
          break;
        // The runner said no to something this socket asked for. The reason
        // arrives as a log line too; this is for a view that wants to offer
        // the remedy — sign in again, a bigger plan, waiting — rather than
        // only show the sentence.
        case 'refused':
          // The picker's refusal is a sentence beside the Pick button, in the
          // runner's own words — or the sentence the same refusal gets elsewhere.
          if (ev.of === 'monitor.pick.start') {
            this.pickError = ev.error === 'runner_busy' ? 'Another organisation is driving the runner right now — try again when it is free'
              : ev.error === 'forbidden' ? 'Only an owner or admin of this organisation can do that'
                : ev.error === 'entitlement' ? null
                  : (ev.error || 'The runner refused to start picking');
          }
          if (ev.error === 'step_up_required') this.say('Allowing an origin needs a recent sign-in — sign in again, then retry', 'error');
          else if (ev.error === 'entitlement') this.upgrade = { limit: ev.limit, plan: ev.plan, of: ev.of };
          else if (ev.error === 'runner_busy') this.say('Another organisation is driving the runner right now — try again when it is free', 'error');
          else if (ev.error === 'forbidden') this.say('Only an owner or admin of this organisation can do that', 'error');
          break;
        // The driven page's own console, oldest first: a log is read downwards,
        // and the dock keeps you on the newest line. Stamped on arrival, with
        // the runner's own stamp kept as `sent`, so it interleaves with the
        // runner's lines in the order the two actually came in. Capped — a page
        // in a render loop can print faster than anyone can read — but higher
        // than the log, because here every line is the point.
        case 'console':
          this.console.push({ ...ev, id: `${Date.now()}-${Math.random()}`, seq: ++arrival, sent: ev.at, at: Date.now() });
          if (this.console.length > MAX_CONSOLE) this.console.splice(0, this.console.length - MAX_CONSOLE);
          break;
        case 'nav':
          this.navs.unshift({ id: `${Date.now()}-${Math.random()}`, ...ev });
          if (this.navs.length > 25) this.navs.length = 25;
          break;

        // A new recording starts with nothing known about it — with fixes off
        // its events carry no notes at all, and the last one's must not stay.
        case 'record.state':
          this.recording = ev.on;
          if (ev.on) this.forgetNotes();
          break;
        case 'recorded': {
          this.recordedFlow = ev.flow ?? this.recordedFlow;
          this.recordedCount = ev.count ?? this.recordedCount;
          const next = notesOn({ rev: this.recordRev, notes: this.recordNotes }, ev);
          this.recordRev = next.rev;
          this.recordNotes = next.notes;
          break;
        }
        // What the runner has worked out about the recording's steps since —
        // Thinking…, a step's one line, a concern — for the revision on screen only.
        case 'record.notes':
          this.recordNotes = notesOn({ rev: this.recordRev, notes: this.recordNotes }, ev).notes;
          break;

        case 'suite.start':
          this.suiteRun = { suite: ev.suite, cases: ev.cases, done: 0, passed: 0 };
          this.say(`running ${ev.cases} case${ev.cases === 1 ? '' : 's'} of ${ev.suite}`);
          break;
        case 'suite.end':
          this.suiteRun = null;
          this.say(`${ev.suite}: ${ev.passed}/${ev.total} cases passed`,
                   ev.passed === ev.total ? 'info' : 'error');
          break;

        case 'run.start':
          this.running = true;
          this.run = {
            suite: ev.suite, caseName: ev.caseName ?? null, total: ev.total, ok: null, fixed: null,
            steps: Array.from({ length: ev.total }, (_, i) => ({ i, state: 'idle', ms: null, error: null, fixes: [], thinking: null, trace: [] })),
          };
          break;
        case 'step.start': if (this.run) this.run.steps[ev.i] = { ...this.run.steps[ev.i], state: 'run', step: ev.step }; break;
        /**
         * A fix lands on its step the moment it is applied — before the step
         * passes, because the pass is what the fix bought and the row should
         * say how while it is still the running one. step.pass then carries
         * the step's complete list, which wins: a fix that was tried and then
         * superseded is not one the step needed.
         */
        case 'step.heal':
          if (this.run?.steps[ev.i]) this.run.steps[ev.i] = { ...this.run.steps[ev.i], fixes: addFix(this.run.steps[ev.i].fixes, ev.fix) };
          break;
        /**
         * The runner is asking the AI about this step: reading the page,
         * deciding, checking the answer. Kept on the step as { phase, text,
         * since } for the one quiet line under its row, and cleared on `done`
         * (thinking.js). A verdict clears it too, below — `done` always comes,
         * but a socket that dropped it would otherwise leave a passed step
         * still "working out what changed".
         */
        case 'step.thinking':
          if (this.run?.steps[ev.i]) this.run.steps[ev.i] = thinkingOn(this.run.steps[ev.i], ev, Date.now());
          break;
        /**
         * One line of how the runner is working this step out — what it saw,
         * which rules it tried, what the AI noticed and decided, what was
         * checked and done (reasoning.js). Kept on the step after its verdict,
         * which carries the whole list and wins.
         */
        case 'step.trace':
          if (this.run?.steps[ev.i]) this.run.steps[ev.i] = traceOn(this.run.steps[ev.i], ev);
          break;
        case 'step.pass':
          if (this.run) {
            const was = this.run.steps[ev.i];
            this.run.steps[ev.i] = traceOn(thinkingOn({ ...was, state: 'pass', ms: ev.ms, fixes: Array.isArray(ev.fixes) ? ev.fixes : (was?.fixes ?? []) }, ev), ev);
          }
          break;
        case 'step.fail':
          if (this.run) this.run.steps[ev.i] = traceOn(thinkingOn({ ...this.run.steps[ev.i], state: 'fail', ms: ev.ms, error: ev.error }, ev), ev);
          break;
        // This organisation's count of suggestions waiting on a person changed.
        case 'fixes': this.fixesPending = typeof ev.pending === 'number' ? ev.pending : this.fixesPending; break;
        case 'run.end':
          this.running = false;
          // Kept on the run so the dock can say "Passed with 2 fixes" after the
          // fact; a runner too old to count sends nothing, and null says so.
          if (this.run) { this.run.ok = ev.ok ?? null; this.run.fixed = typeof ev.fixed === 'number' ? ev.fixed : null; }
          // A run that ended is thinking about nothing, whatever its last step was told.
          if (this.run) this.run.steps = this.run.steps.map((s) => thinkingOn(s, ev));
          if (this.suiteRun) { this.suiteRun.done++; if (ev.ok) this.suiteRun.passed++; }
          break;

        // An imported flow is not the runner's recording: notes about that
        // recording would be drawn beside these steps, and a fix pressed on one
        // would change the recording underneath instead.
        case 'imported':
          this.recordedFlow = ev.flow;
          this.recordedCount = ev.steps;
          this.forgetNotes();
          break;
        // Agentic monitoring: the runner's monitors and incidents, mirrored.
        case 'support': this.support = { enabled: !!ev.enabled, since: ev.since ?? null }; break;
        case 'monitor.pick': this.picking = !!ev.on; if (ev.on) this.pickError = null; break;
        case 'monitor.selected':
          this.picking = false;
          this.picked = { selector: ev.selector, fingerprint: ev.fingerprint ?? null, snapshot: ev.snapshot ?? null, label: ev.label ?? '', url: ev.url ?? this.url };
          break;
        case 'monitor.tick': {
          // Only the numbers; the rest of the card is the monitor's, which arrives whole as monitor.changed.
          const m = this.monitors.find((x) => x.id === ev.monitorId);
          if (m) { m.metrics = ev.metrics; m.state = ev.state; m.lastTickAt = ev.at; }
          break;
        }
        case 'monitor.changed': this.upsertMonitor(ev.monitor); break;
        case 'monitor.gone': this.dropMonitor(ev.id); break;
        case 'incident.opened':
        case 'incident.updated':
        case 'incident.resolved':
          this.upsertIncident(ev.incident);
          break;
        case 'log': this.say(ev.msg, ev.level); break;
      }
    },
  },
});
