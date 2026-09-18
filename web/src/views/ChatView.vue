<script setup>
/**
 * Chat: ask the runner what it knows, in words.
 *
 * "How many defects do we have", "what were the latest scans", "test the
 * contact us page" — the runner answers out of the stores it already keeps
 * and, for the last one, by running the case. The reply is written on the
 * socket (stores/chat.js), so a question whose answer is a run shows the run
 * as it happens rather than a spinner for as long as the case takes.
 *
 * Two shapes of one page. Before anything is asked: the question, centred,
 * with six things worth asking under it. After: the transcript, owning its
 * own scroll, with the composer docked at the foot and a button back to the
 * end once you have scrolled up to read. Past conversations live in the app's
 * sidebar under Chat (SideNav), on every page. While a reply is being made,
 * the agents at work on it are drawn step by step (ChatActivity).
 *
 * Nothing a reply says runs anything by itself. A scan, a quickstart or a
 * batch of drafted checks is a PROPOSAL, and the buttons under it are the
 * only way it happens — that is the runner's rule (chat.js), and this page
 * only draws it.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { useSuites } from '@/stores/suites';
import { useChatStore } from '@/stores/chat';
import { when } from '@/time';
import TopBar from '@/components/TopBar.vue';
import EmptyState from '@/components/EmptyState.vue';
import UpgradePrompt from '@/components/UpgradePrompt.vue';
import RunnerBusy from '@/components/RunnerBusy.vue';
import Btn from '@/components/Btn.vue';
import Icon from '@/components/Icon.vue';
import ChatText from '@/components/ChatText.vue';
import ChatData from '@/components/ChatData.vue';
import ChatComposer from '@/components/ChatComposer.vue';
import ChatActivity from '@/components/ChatActivity.vue';
import { agentOf } from '@/agents';
import ChatRunCard from '@/components/ChatRunCard.vue';
import ChatDraftList from '@/components/ChatDraftList.vue';

const live = useLive();
const suites = useSuites();
const chat = useChatStore();

const draft = ref('');
const composer = ref(null);   // the ChatComposer on the page, whichever place it is drawn in
const scroller = ref(null);   // the transcript's own scroll container
const column = ref(null);     // what grows inside it
const firstPage = ref(null);  // the first page of the first suite, for the two page tiles

onMounted(async () => {
  await chat.load();
  // Back where this viewer was, when the runner still has that conversation.
  await chat.restore();
  nextTick(() => composer.value?.focus());
  // Two tiles name a real page — the first of the first suite — or are not
  // offered: a tile that asks about nothing teaches nothing.
  try {
    if (!suites.list.length) await suites.loadList();
    const s = suites.list[0];
    firstPage.value = s ? ((await api.suite(s.id)).suite?.pages?.[0]?.name ?? null) : null;
  } catch { firstPage.value = null; }
});

/** Which mind answers, for the chip in the top bar: the model by name, or the rules. */
const mode = computed(() => {
  const llm = chat.llm;
  if (!llm) return null;
  if (llm.mode === 'claude') {
    return { label: `Claude · ${llm.model}`, claude: true,
             title: `Replies are written by ${llm.model}; every number in them comes from the runner's own tools` };
  }
  return { label: 'Rules only', claude: false,
           title: llm.key?.have ? 'GC_CHAT=mock — answered by rules over the same tools the model drives'
                                : 'No API key on the runner — answered by rules over the same tools the model drives' };
});

/** A question can be sent at all: a runner that is connected, offers chat, and has it on. */
const canSend = computed(() => live.connected && chat.available !== false && chat.on !== false);
/** The runner is writing somebody else's reply — one at a time per organisation. */
const otherTurn = computed(() => !!chat.busy && !chat.turn);
/** The page can take a question: the runner offers chat, it is on, and we know so. */
const ready = computed(() => chat.available !== false && chat.on !== false && !(chat.available === null && chat.loading));

const messages = computed(() => chat.current?.messages ?? []);
const empty = computed(() => !messages.value.length && !chat.writing);

/** Three questions, and a page to test when there is one. */
const suggestions = computed(() => [
  'How many defects do we have?',
  'What were the latest scans?',
  'Which test cases are saved?',
  ...(firstPage.value ? [`Test the ${firstPage.value} page`, `Draft tests for the ${firstPage.value} page`] : []),
]);

/**
 * The tiles under the hero: a short title, a line on what the runner answers,
 * a glyph — and the question the press actually sends, word for word what a
 * person would type (the mock mind's intents read it, chat-mock.js).
 */
const ABOUT = {
  'How many defects do we have?': { title: 'Count the defects', sub: "Open, closed and reopened, from the runner's records", icon: 'defects' },
  'What were the latest scans?': { title: 'Show the latest scans', sub: 'The newest runs and the last page scanned', icon: 'console' },
  'Which test cases are saved?': { title: 'List the saved cases', sub: 'Every case in every suite, with its size', icon: 'list' },
  'Which suites are set up?': { title: 'List the suites', sub: 'Pages, cases and origin, per suite', icon: 'suite' },
};
const tiles = computed(() => [...suggestions.value, 'Which suites are set up?'].map((text) => (
  ABOUT[text] ? { text, ...ABOUT[text] }
    : text.startsWith('Draft') ? { text, title: `Draft tests for ${firstPage.value}`, sub: 'Reads the page and proposes checks to tick', icon: 'spark' }
      : { text, title: text, sub: 'Runs the saved case for that page, live', icon: 'play' })));

/** A run tool is under way for this reply: the live run belongs under its tool line. */
const liveRun = computed(() => (chat.writing && chat.turn.running && live.run ? live.run : null));
const stepsDone = computed(() => liveRun.value?.steps.filter((s) => s.state !== 'idle').length ?? 0);

/** The proposal's buttons go under the message that made it, and only while it is still the one waiting. */
const awaiting = (m) => !!m.proposal && chat.current?.proposal?.id === m.proposal.id;
/** How an assistant message signs itself. */
const signed = (m) => (m.mind === 'claude' ? (m.model ?? 'Claude') : m.mind === 'mock' ? 'rules' : m.mind === 'runner' ? 'the runner' : null);

const crumbs = computed(() => [{ label: 'General' }, { label: 'Chat' }, ...(chat.current ? [{ label: chat.current.title }] : [])]);
const placeholder = computed(() => (canSend.value ? 'Ask about defects, runs, suites — or name a page to test'
  : live.connected ? 'Chat is not available on this runner' : 'Runner offline'));

// ---------------------------------------------------------------- a new one
function startFresh() {
  chat.fresh();
  nextTick(() => composer.value?.focus());
}

// ---------------------------------------------------------------- asking
async function submit() {
  const text = draft.value.trim();
  if (!text || !canSend.value || chat.pending) return;
  draft.value = '';
  const sent = await chat.send(text);
  // A refusal keeps the words: nobody should retype a question the runner would not take.
  if (!sent && !draft.value) draft.value = text;
}
const ask = (text, opts) => { if (canSend.value) chat.send(text, opts); };

/**
 * A drafted check that passed becomes a saved case with one press: the
 * runner's own POST /api/suites/:id/cases, marked `generated` so nobody
 * mistakes it for a recording. Nothing is saved without this press.
 */
const saved = ref(new Set());
const saving = ref(null);
const keyOf = (r) => `${r.suiteId}:${r.candidate ?? r.caseName}:${r.at}`;
async function keep(r) {
  if (!r?.flow || !r.suiteId || saving.value) return;
  saving.value = keyOf(r);
  try {
    await api.addCase(r.suiteId, { name: r.caseName, pageId: r.pageId ?? null, flow: r.flow, source: 'generated' });
    saved.value = new Set([...saved.value, keyOf(r)]);
  } catch (e) {
    chat.error = e.message;
  } finally {
    saving.value = null;
  }
}
/** The tick and the run: the ticked ids ride on the confirm (stores/chat.js send). */
const runDrafts = (m, ids) => ask(ids.length === (m.proposal.items?.length ?? 0) ? 'Yes, run them all' : 'Yes, run the ones I ticked', { confirm: m.proposal.id, choices: ids });

// ---------------------------------------------------------------- scrolling
/**
 * The transcript keeps its end in view while the reader is at the end, and
 * leaves them alone once they have scrolled up to read — the round button is
 * the way back. A reader's own question always brings the end into view.
 */
const THRESHOLD = 48;
const atBottom = ref(true);
const settling = ref(false);   // a smooth scroll under way: not a reason to show the button
let settleTimer = null;
function measure() {
  const el = scroller.value;
  if (!el) return;
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= THRESHOLD;
  if (atBottom.value) { settling.value = false; clearTimeout(settleTimer); }
}
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function toBottom(behavior = 'smooth') {
  const el = scroller.value;
  if (!el) return;
  const smooth = behavior === 'smooth' && !reduced();
  if (smooth) {
    settling.value = true;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { settling.value = false; measure(); }, 700);
  }
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  if (!smooth) measure();
}

let lastCount = 0;
// New words, ours or the runner's, keep the end of the transcript in view —
// smoothly for a question just asked, at once for the words of a reply as
// they stream, and never against a reader who scrolled up.
watch([() => messages.value.length, () => chat.turn?.text, () => chat.turn?.tools.length, stepsDone], ([count]) => {
  const own = count !== lastCount && messages.value[messages.value.length - 1]?.role === 'user';
  lastCount = count;
  if (own || atBottom.value) nextTick(() => toBottom(own ? 'smooth' : 'auto'));
});
// Opening a conversation lands at its end, without a journey from the top.
watch(() => chat.current?.id, () => { lastCount = messages.value.length; nextTick(() => toBottom('auto')); });
// The composer remounts in the dock when the first message lands: keep the caret in it.
watch(empty, (e) => { if (!e) nextTick(() => composer.value?.focus()); });

// Growth the watch above cannot see — the box growing a line, a run card
// landing, "show steps" opening — keeps the end in view the same way.
let ro = null;
const observe = (el, old) => {
  if (old) ro?.unobserve(old);
  if (!el) return;
  ro ??= new ResizeObserver(() => { if (atBottom.value) toBottom('auto'); else measure(); });
  ro.observe(el);
  measure();
};
watch(scroller, observe, { flush: 'post' });
watch(column, observe, { flush: 'post' });
onBeforeUnmount(() => { ro?.disconnect(); clearTimeout(settleTimer); });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" :data-chat="empty ? 'empty' : 'conversation'">
    <TopBar :crumbs="crumbs">
      <template #actions>
        <span v-if="mode" class="hidden items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium md:inline-flex"
              :class="mode.claude ? 'border-brand/20 bg-brand-50 text-brand-2' : 'border-hairline bg-panel text-ink-2'"
              :title="mode.title">
          {{ mode.label }}
          <span v-if="mode.claude && chat.budget" class="font-normal text-ink-3">{{ chat.budget.used }}/{{ chat.budget.max }}</span>
        </span>
        <Btn variant="ghost" size="sm" :disabled="!chat.current"
             title="Start another conversation; this one stays under Recent chats in the sidebar" @click="startFresh">+ New chat</Btn>
      </template>
    </TopBar>

    <!-- The transcript owns the scroll, so the composer below it never scrolls away. -->
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto" @scroll.passive="measure">
      <div ref="column" class="mx-auto w-full max-w-3xl px-6 pb-6 pt-8"
           :class="ready && empty && 'flex min-h-full flex-col justify-center'">
        <p v-if="chat.available === null && chat.loading" class="text-[13.5px] text-ink-3">Asking the runner…</p>

        <!-- A runner from before the chat existed: it answers 404, and that is all it can say. -->
        <EmptyState v-else-if="chat.available === false" title="This runner does not offer chat"
                    body="It answers 404 to /api/chat, so it predates the chat assistant. Update the runner and this
                          page fills in; everything else works as it did.">
          <RouterLink to="/console" class="rounded-full bg-brand px-4 py-2 text-[13.5px] font-medium text-white hover:bg-brand-deep">
            Open the console
          </RouterLink>
        </EmptyState>

        <!-- The operator turned it off, for everyone. -->
        <div v-else-if="chat.on === false" class="card wash-warm p-5">
          <p class="text-[13.5px] font-medium">Chat is turned off on this deployment (runner.chat).</p>
          <p class="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
            Whoever operates this runner switched the assistant off, so no question is taken here. The
            rest of the product is unaffected: run history, defects and the console answer the same
            questions the long way round.
          </p>
          <div class="mt-3 flex gap-2">
            <RouterLink to="/defects" class="rounded-full border border-hairline px-4 py-2 text-[13px] hover:border-ink/25">Defects</RouterLink>
            <RouterLink to="/dashboard" class="rounded-full border border-hairline px-4 py-2 text-[13px] hover:border-ink/25">Run history</RouterLink>
          </div>
        </div>

        <template v-else>
          <UpgradePrompt v-if="chat.upgrade" class="mb-4" :limit="chat.upgrade.limit" :plan="chat.upgrade.plan" @dismiss="chat.upgrade = null" />
          <RunnerBusy class="mb-4" />

          <!-- nothing asked yet: the question, and six things worth asking ------ -->
          <section v-if="empty" class="py-6">
            <h1 class="display text-balance text-center text-4xl">Ask the runner what it knows.</h1>
            <p class="mx-auto mt-3 max-w-xl text-balance text-center text-[14.5px] leading-relaxed text-ink-2">
              Defects, runs, suites and saved cases — or name a page to test. Every number comes from the
              runner's own records.
            </p>
            <ChatComposer ref="composer" v-model="draft" class="mt-8" :can-send="canSend" :placeholder="placeholder"
                          :busy="!!chat.turn" :running="!!chat.turn?.running" :stopping="!!chat.stopping" :other-turn="otherTurn"
                          @submit="submit" @stop="chat.stop()" />
            <p v-if="chat.error" class="mt-2 rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">{{ chat.error }}</p>
            <div class="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <button v-for="t in tiles" :key="t.text" type="button" data-tile :disabled="!canSend || otherTurn"
                      class="group flex items-start gap-3 rounded-xl border border-hairline bg-panel px-4 py-3.5 text-left
                             hover:border-ink/25 hover:bg-ink/[0.02] disabled:cursor-not-allowed disabled:opacity-60"
                      @click="ask(t.text)">
                <Icon :name="t.icon" class="mt-0.5 size-4 shrink-0 text-ink-3 group-hover:text-ink" />
                <span class="min-w-0">
                  <span class="block text-[13.5px] font-medium leading-snug text-ink">{{ t.title }}</span>
                  <span class="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{{ t.sub }}</span>
                </span>
              </button>
            </div>
          </section>

          <!-- transcript ---------------------------------------------------- -->
          <ol v-else class="space-y-6">
            <li v-for="m in messages" :key="m.id" class="flex flex-col" :class="m.role === 'user' ? 'items-end' : 'items-start'">
              <div v-if="m.role === 'user'" data-message="user"
                   class="max-w-[72%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-hairline bg-panel px-4 py-2.5
                          text-[13.5px] leading-relaxed text-ink [overflow-wrap:anywhere]">{{ m.text }}</div>
              <!-- An answer is plain text on the page. The runner's own short
                   notes (mind: runner) are the engine talking, not an answer,
                   and sit in a muted box; a dead turn sits in a red one. -->
              <ChatText v-else data-message="assistant" :text="m.text" class="w-full"
                        :tone="m.error ? 'error' : m.mind === 'runner' ? 'note' : 'answer'"
                        :class="m.error ? 'rounded-xl border border-critical/25 bg-critical/5 px-4 py-3'
                              : m.mind === 'runner' ? 'rounded-xl border border-dashed border-hairline bg-ground px-4 py-3' : ''" />
              <!-- What the tools read, drawn: tiles, the runs chart, tables (chat.js data, ChatData). -->
              <ChatData v-for="(d, i) in m.data ?? []" :key="`${m.id}-d${i}`" :view="d" class="mt-3 w-full" />

              <!-- The agents that answered, one badge each (agents.js), with what they did. -->
              <ul v-if="m.role === 'assistant' && m.tools?.length" class="mt-2 flex flex-wrap gap-1.5">
                <li v-for="c in m.tools" :key="c.id"
                    class="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px]"
                    :class="c.refused ? 'border-warn/40 text-warn' : c.ok === false ? 'border-critical/40 text-critical' : 'border-hairline text-ink-2'"
                    :title="`${agentOf(c.name).name} · ${c.label}${c.summary ? ` — ${c.summary}` : ''}`">
                  <Icon :name="agentOf(c.name).icon" class="size-3 shrink-0 text-ink-3" />
                  <span class="shrink-0 font-medium">{{ agentOf(c.name).name }}</span>
                  <span class="truncate">{{ c.label }}<template v-if="c.summary"> — {{ c.summary }}</template></span>
                </li>
              </ul>
              <!-- Where a reply was read from: the documentation sections it cited (chat.js sources). -->
              <div v-if="m.sources?.length" class="mt-2 flex flex-wrap gap-1.5">
                <span v-for="s in m.sources" :key="`${s.file}#${s.heading}`"
                      class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-hairline bg-panel px-2.5 py-0.5 text-[11.5px] text-ink-2"
                      :title="`Read from ${s.file}, under “${s.heading}”`">
                  <svg viewBox="0 0 16 16" class="size-3 shrink-0 text-ink-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3.5 2.5h6l3 3v8h-9zM9.5 2.5v3h3M5.5 8h5M5.5 10.5h5" />
                  </svg>
                  <span class="truncate">{{ s.heading }}</span>
                  <span class="shrink-0 text-ink-3">{{ s.file }}</span>
                </span>
              </div>
              <div v-if="m.runs?.length" class="mt-3 w-full space-y-2">
                <ChatRunCard v-for="(r, i) in m.runs" :key="`${m.id}-${i}`" :run="r"
                             :saved="saved.has(keyOf(r))" :saving="saving === keyOf(r)" @save="keep(r)" />
              </div>
              <!-- A follow-up already written: pressed rather than typed out again. -->
              <div v-if="m.offers?.length" class="mt-3 flex flex-wrap gap-1.5">
                <Btn v-for="o in m.offers" :key="o.text" variant="ghost" size="sm"
                     :disabled="!canSend || !!chat.turn || otherTurn" :title="o.text" @click="ask(o.text)">{{ o.label }}</Btn>
              </div>
              <!-- The proposal's buttons. Drafted checks (items) ARE the confirm:
                   tick some, press Run, and the ticked ids ride on the yes. -->
              <div v-if="awaiting(m)" class="mt-3 w-full rounded-xl border border-brand/20 bg-brand-50 px-3 py-2 text-[12.5px]">
                <ChatDraftList v-if="m.proposal.items?.length" :items="m.proposal.items" :disabled="!canSend || !!chat.turn || otherTurn"
                               @run="(ids) => runDrafts(m, ids)" @drop="ask('No, leave it')" />
                <div v-else class="flex flex-wrap items-center gap-2">
                  <span class="text-ink">Go ahead and {{ m.proposal.label }}?</span>
                  <Btn size="sm" :disabled="!canSend || !!chat.turn || otherTurn" @click="ask('Yes, do it', { confirm: m.proposal.id })">Yes, do it</Btn>
                  <Btn size="sm" variant="ghost" :disabled="!canSend || !!chat.turn || otherTurn" @click="ask('No, leave it')">No</Btn>
                </div>
              </div>
              <p class="mt-1.5 text-[11px] text-ink-3">
                {{ when(m.at) }}<template v-if="m.role === 'assistant' && signed(m)"> · {{ signed(m) }}</template>
              </p>
            </li>

            <!-- The reply being written: its words as they stream, or a thought;
                 its tool calls as they start and land; the run, live. -->
            <li v-if="chat.writing" class="flex flex-col items-start" data-message="writing">
              <ChatActivity :turn="chat.turn" class="w-full" />
              <ChatText v-if="chat.turn.text" :text="chat.turn.text" caret class="mt-3 w-full" />
              <div v-if="liveRun" class="mt-3 w-full">
                <ChatRunCard :live="liveRun" />
                <p v-if="live.suiteRun" class="mt-1 text-[11.5px] text-ink-3">
                  {{ live.suiteRun.done }} of {{ live.suiteRun.cases }} cases so far, {{ live.suiteRun.passed }} passed
                </p>
              </div>
            </li>
          </ol>
        </template>
      </div>
    </div>

    <!-- the composer, docked ------------------------------------------------- -->
    <div v-if="ready && !empty" class="relative shrink-0 bg-ground px-6 pb-3 pt-2">
      <button type="button" aria-label="Scroll to the latest message" title="Back to the latest message"
              class="absolute -top-12 left-1/2 z-10 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-hairline
                     bg-panel text-ink-2 transition-opacity duration-150 hover:border-ink/25 hover:text-ink"
              :class="atBottom || settling ? 'pointer-events-none opacity-0' : 'opacity-100'"
              :tabindex="atBottom || settling ? -1 : 0" @click="toBottom()">
        <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 6.5l4 4 4-4" />
        </svg>
      </button>
      <div class="mx-auto w-full max-w-3xl">
        <ChatComposer ref="composer" v-model="draft" :can-send="canSend" :placeholder="placeholder"
                      :busy="!!chat.turn" :running="!!chat.turn?.running" :stopping="!!chat.stopping" :other-turn="otherTurn"
                      @submit="submit" @stop="chat.stop()" />
        <p v-if="chat.error" class="mt-2 rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">{{ chat.error }}</p>
        <p class="mt-2 text-center text-[11px] text-ink-3">
          Answers come from the runner's own records; a model can still misread them. Nothing runs without a yes from you.
        </p>
      </div>
    </div>

  </div>
</template>
