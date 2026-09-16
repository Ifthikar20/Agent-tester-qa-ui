/**
 * The chat: a conversation with the runner about what it knows.
 *
 * The runner keeps the transcript — one per organisation, twenty
 * conversations of two hundred messages — and answers a turn on the socket
 * rather than on the request: a POST is a 202 with the turn's id, and the
 * reply arrives as `chat.*` events, because an answer that runs a case takes
 * as long as the case does. So this store is two things: a cache of what the
 * runner keeps (`conversations`, `current`) and the one reply being written
 * (`turn`), built up from the events as they land and replaced by the message
 * the runner kept once `chat.done` says so.
 *
 * The socket is stores/live.js's. It hands every `chat.*` event here and calls
 * `refresh()` when it (re)connects — a `chat.done` that landed while the
 * socket was down is on the runner, not here, and the re-read is how it
 * arrives.
 *
 * An OLDER runner has no /api/chat at all and answers 404. That is not a
 * fault: `available` turns false and the page says the runner does not offer
 * chat, rather than drawing a red box over a request that was never going to
 * work.
 */
import { defineStore } from 'pinia';
import { api } from '@/api';

/** The runner's own limits (chat.js), mirrored so the page can say so before asking. */
export const TEXT_MAX = 2000;
const TITLE_MAX = 60;
/** The tools that drive a run: while one is in flight the page shows the live run under the tool line. */
export const RUN_TOOLS = new Set(['run_case', 'run_suite', 'run_page_check', 'quickstart']);
/** Events held while a send() waits on its 202; past this many, something else is wrong. */
const EARLY_MAX = 200;
/** Turn ids that finished, remembered so a stale answer to GET /api/chat cannot resurrect one. */
const FINISHED_MAX = 20;

/** The reply being written for a turn, before any of it has arrived. */
const blank = (id, conversationId) => ({ id, conversationId, text: '', tools: [], proposal: null, running: false });

/**
 * Which conversation this viewer had open, remembered in the browser the way
 * the sidebar's width and the run pace are (stores/ui.js, stores/live.js):
 * a reload in the middle of a long run should come back to the run, not to
 * an empty page with the conversation two clicks away in the picker. Both
 * halves wrapped — localStorage throws in a private window.
 */
const OPEN_KEY = 'gc.chat.open';
const remember = (id) => { try { if (id) localStorage.setItem(OPEN_KEY, id); else localStorage.removeItem(OPEN_KEY); } catch { /* private window */ } };
const remembered = () => { try { return localStorage.getItem(OPEN_KEY); } catch { return null; } };
/** The first words as a title — the runner's own rule for a new conversation. */
const titled = (text) => String(text).slice(0, TITLE_MAX);

export const useChatStore = defineStore('chat', {
  state: () => ({
    available: null,    // null until probed; false when the runner answers 404 — an older runner
    on: true,           // the runner.chat switch, as the runner last said
    llm: null,          // { mode: 'claude'|'mock', model, key: { have, from } }
    budget: null,       // { used, max } — model calls today
    busy: null,         // { id, conversationId }: the turn the runner is answering, whoever asked
    conversations: [],  // the list rows, newest first
    current: null,      // the open conversation with its messages — or null, so the next send starts one
    /**
     * The reply being written: `text` as it streams (Claude only; the rules
     * send none), `tools` as calls keyed by id where the latest state wins,
     * `proposal` when the reply made one, `running` once a run tool started.
     */
    turn: null,
    error: null,        // a sentence for under the composer
    upgrade: null,      // { limit, plan }: the plan said no to a turn — a prompt, not a red box
    loading: false,
    /**
     * A send() waiting on its 202, and the events that arrived meanwhile.
     * The runner tells the sockets before it answers the request, so the
     * first events about a turn — in mock mode the whole reply — can land
     * before its id is known here. They are held, and replayed once it is.
     */
    pending: null,
    early: [],
    finished: [],
  }),

  getters: {
    /** Whether the reply being written is the open conversation's — the one the page draws. */
    writing: (s) => !!s.turn && !!s.current && s.turn.conversationId === s.current.id,
  },

  actions: {
    /**
     * What the runner offers, and its conversations. Quiet (no `loading`)
     * after the first time: a re-read behind a transcript is not a page load.
     */
    async load({ quiet = false } = {}) {
      if (!quiet) this.loading = true;
      try {
        const r = await api.chat();
        this.available = true;
        this.on = r.on !== false;
        this.llm = r.llm ?? null;
        this.budget = r.budget ?? null;
        this.busy = r.busy ?? null;
        this.conversations = Array.isArray(r.conversations) ? r.conversations : [];
        // A reply the runner is writing for the conversation open here — a
        // reload mid-turn, or a turn asked from another tab — is a reply in
        // flight here too, unless this tab already saw it finish.
        if (r.busy && !this.turn && this.current?.id === r.busy.conversationId && !this.finished.includes(r.busy.id)) {
          this.turn = blank(r.busy.id, r.busy.conversationId);
        }
        // What is waiting for a yes is the runner's to say; the rows carry it.
        const row = this.current ? this.conversations.find((c) => c.id === this.current.id) : null;
        if (row) this.current.proposal = row.proposal ?? null;
      } catch (e) {
        // No such route: a runner from before the chat existed.
        if (e.status === 404) { this.available = false; return; }
        this.error = e.message;
      } finally {
        if (!quiet) this.loading = false;
      }
    },

    /** One conversation, with its messages: the picker, and the re-read after a reconnect. */
    async open(id) {
      this.error = null;
      try {
        const { conversation } = await api.chatConversation(id);
        this.current = conversation;
        remember(conversation.id);
        if (this.busy && !this.turn && this.busy.conversationId === conversation.id && !this.finished.includes(this.busy.id)) {
          this.turn = blank(this.busy.id, this.busy.conversationId);
        }
      } catch (e) {
        // Gone — deleted from another tab, or a runner that no longer has it.
        if (e.status === 404) {
          this.conversations = this.conversations.filter((c) => c.id !== id);
          if (this.current?.id === id) this.current = null;
        }
        this.error = e.message;
      }
    },

    /** No conversation open: the next send starts one, titled by its first words. */
    fresh() {
      this.current = null;
      this.error = null;
      remember(null);
    },

    /** The conversation this viewer had open last time, if the runner still has it. */
    async restore() {
      if (this.current) return;
      const id = remembered();
      if (id && this.conversations.some((c) => c.id === id)) await this.open(id);
    },

    /**
     * Ask. Accepted with a 202 and answered on the socket: the person's
     * bubble goes up at once and the reply builds in `turn` as events land.
     *
     * @param confirm the id of the proposal a button confirmed, when one did
     * @returns whether the runner took the turn — a refusal is in `error`
     *          (or `upgrade`, or `on`), never thrown at the view
     */
    async send(text, { confirm = null } = {}) {
      const asked = String(text ?? '').trim().slice(0, TEXT_MAX);
      if (!asked || this.pending) return false;
      this.error = null;
      const conversationId = this.current?.id ?? null;
      this.pending = { asked };
      let r;
      try {
        r = await api.chatTurn({
          ...(conversationId ? { conversationId } : {}),
          text: asked,
          ...(confirm ? { confirm } : {}),
        });
      } catch (e) {
        // Whatever landed meanwhile was somebody else's turn: read it as it
        // would have been, now that nothing of ours is on its way.
        const held = this.early;
        this.early = []; this.pending = null;
        for (const ev of held) this.handle(ev);
        // The runner is writing another reply — say so, and draw it if it is
        // this conversation's.
        if (e.chatBusy?.turnId) {
          this.busy = { id: e.chatBusy.turnId, conversationId: e.chatBusy.conversationId };
          if (!this.turn && this.current?.id === e.chatBusy.conversationId) this.turn = blank(this.busy.id, this.busy.conversationId);
        }
        if (e.switchedOff === 'runner.chat') { this.on = false; return false; }
        if (e.entitlement) { this.upgrade = e.entitlement; return false; }
        if (e.status === 404 && conversationId) {
          this.conversations = this.conversations.filter((c) => c.id !== conversationId);
          this.current = null;
        }
        this.error = e.message;
        return false;
      }

      const at = Date.now();
      // A conversation the runner just made from these words: a local copy,
      // and a row in the picker, until the list is next read.
      if (!this.current || this.current.id !== r.conversationId) {
        const title = titled(asked);
        this.current = { id: r.conversationId, title, createdAt: at, updatedAt: at, proposal: null, messages: [] };
        remember(r.conversationId);
        if (!this.conversations.some((c) => c.id === r.conversationId)) {
          this.conversations.unshift({ id: r.conversationId, title, createdAt: at, updatedAt: at, messages: 0, last: null, proposal: null });
        }
      }
      this.current.messages.push({
        id: `local_${r.turnId}`, role: 'user', at, text: asked, by: null, mind: null, model: null,
        tools: [], runs: [], offers: null, proposal: null, executed: null, error: null,
      });
      this.current.updatedAt = at;
      // A button's yes or no takes the proposal with it; the runner drops it
      // on its side before answering, and the list re-read confirms.
      if (confirm || asked === 'No, leave it') this.current.proposal = null;
      this.busy = { id: r.turnId, conversationId: r.conversationId };

      // Its reply may already be in: whatever came before the 202 is read
      // now, in order — ours first, then anything else that was held.
      const held = this.early;
      this.early = []; this.pending = null;
      this.turn = blank(r.turnId, r.conversationId);
      for (const ev of held.filter((x) => x.turn === r.turnId)) this.handle(ev);
      for (const ev of held.filter((x) => x.turn !== r.turnId)) this.handle(ev);
      return true;
    },

    /** Delete a conversation. A reply in flight for it has nowhere to go, so it goes too. */
    async remove(id) {
      this.error = null;
      try { await api.deleteChat(id); }
      catch (e) { if (e.status !== 404) { this.error = e.message; return false; } }
      this.conversations = this.conversations.filter((c) => c.id !== id);
      if (this.current?.id === id) { this.current = null; remember(null); }
      if (this.turn?.conversationId === id) this.turn = null;
      return true;
    },

    /**
     * The socket is (back) up. A reply that landed while it was down is on the
     * runner and not here: the list again, and the open conversation whole.
     */
    async refresh() {
      await this.load({ quiet: this.available !== null });
      if (this.available === false) return;
      if (this.current) await this.open(this.current.id);
      // The runner is not writing the reply this tab was waiting on: it is in
      // the messages just read, or it died with the socket. Either way, done.
      if (this.turn && !this.pending && this.busy?.id !== this.turn.id) this.turn = null;
    },

    /** The socket's chat.* events, handed over whole by stores/live.js. */
    handle(ev) {
      if (typeof ev?.t !== 'string' || !ev.t.startsWith('chat.')) return;
      if (ev.t === 'chat.turn' && ev.turn) this.busy = { id: ev.turn, conversationId: ev.conversationId };
      // A send() is waiting on its 202 and this is not a turn known here:
      // held until the id is (send() replays it).
      if (this.pending && this.turn?.id !== ev.turn) {
        this.early.push(ev);
        if (this.early.length > EARLY_MAX) this.early.shift();
        return;
      }
      const mine = !!this.turn && this.turn.id === ev.turn;
      const open = !!this.current && this.current.id === ev.conversationId;
      switch (ev.t) {
        case 'chat.turn':
          // Somebody else's question on the conversation open here — another
          // tab, a colleague: their reply is on its way, and their words are
          // re-read so the bubble has something to answer.
          if (!mine && open) { this.turn = blank(ev.turn, ev.conversationId); this.open(ev.conversationId); }
          break;
        case 'chat.delta':
          if (mine) this.turn.text += String(ev.text ?? '');
          break;
        case 'chat.tool': {
          const c = ev.call;
          if (!mine || !c?.id) break;
          const call = { id: c.id, name: c.name, label: c.label ?? c.name, state: c.state, summary: c.summary ?? null };
          // The same id twice — start, then done or error — and the latest wins.
          const i = this.turn.tools.findIndex((x) => x.id === c.id);
          if (i < 0) this.turn.tools.push(call); else this.turn.tools.splice(i, 1, call);
          // A run tool that started is a run to show live; one refused before
          // it ran is not, and whatever run the runner last did is not this one.
          if (RUN_TOOLS.has(c.name)) this.turn.running = c.state !== 'error';
          break;
        }
        case 'chat.proposal':
          if (mine) this.turn.proposal = ev.proposal ?? null;
          if (open) this.current.proposal = ev.proposal ?? null;
          break;
        case 'chat.done':
        case 'chat.error': {
          const m = ev.message ?? null;
          if (open && m && !this.current.messages.some((x) => x.id === m.id)) {
            this.current.messages.push(m);
            this.current.updatedAt = m.at ?? Date.now();
            if (m.proposal) this.current.proposal = m.proposal;
            // A confirmed proposal was executed, or refused: not waiting either way.
            else if (m.executed) this.current.proposal = null;
          }
          if (mine) this.turn = null;
          if (this.busy?.id === ev.turn) this.busy = null;
          this.finished.push(ev.turn);
          if (this.finished.length > FINISHED_MAX) this.finished.shift();
          // The row, until the list is read again: what was said last, and when.
          const row = this.conversations.find((c) => c.id === ev.conversationId);
          if (row && m) {
            row.last = { role: m.role, at: m.at, text: String(m.text ?? '').slice(0, 140) };
            row.updatedAt = m.at ?? Date.now();
            row.messages += 2;
            if (m.proposal) row.proposal = m.proposal; else if (m.executed) row.proposal = null;
          }
          // And the runner's word on all of it — the rows, the budget, what each
          // conversation still has waiting — which is cheap and corrects any guess above.
          if (this.available) this.load({ quiet: true });
          break;
        }
      }
    },
  },
});
