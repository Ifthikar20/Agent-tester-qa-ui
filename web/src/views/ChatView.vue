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
 * Nothing a reply says runs anything by itself. A scan or a quickstart is a
 * PROPOSAL, and the two buttons under it are the only way it happens — that
 * is the runner's rule (chat.js), and this page only draws it.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { useSuites } from '@/stores/suites';
import { TEXT_MAX, useChatStore } from '@/stores/chat';
import { when } from '@/time';
import TopBar from '@/components/TopBar.vue';
import HeroPanel from '@/components/HeroPanel.vue';
import EmptyState from '@/components/EmptyState.vue';
import UpgradePrompt from '@/components/UpgradePrompt.vue';
import RunnerBusy from '@/components/RunnerBusy.vue';
import Btn from '@/components/Btn.vue';
import ChatRunCard from '@/components/ChatRunCard.vue';

const live = useLive();
const suites = useSuites();
const chat = useChatStore();

const draft = ref('');
const box = ref(null);        // the textarea
const end = ref(null);        // the sentinel the transcript scrolls to
const firstPage = ref(null);  // the first page of the first suite, for the fourth suggestion

onMounted(async () => {
  await chat.load();
  // Back where this viewer was, when the runner still has that conversation.
  await chat.restore();
  // The fourth suggestion names a real page — the first of the first suite —
  // or is not offered: a chip that asks about nothing teaches nothing.
  try {
    if (!suites.list.length) await suites.loadList();
    const s = suites.list[0];
    firstPage.value = s ? ((await api.suite(s.id)).suite?.pages?.[0]?.name ?? null) : null;
  } catch { firstPage.value = null; }
});

/** The picker's rows, newest first — the runner lists them so, and a local row keeps it so. */
const rows = computed(() => [...chat.conversations].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)));

/** Which mind answers, for the chip: the model by name, or the rules. */
const mode = computed(() => {
  const llm = chat.llm;
  if (!llm) return null;
  if (llm.mode === 'claude') {
    return { label: `Claude · ${llm.model}`, claude: true,
             title: `Replies are written by ${llm.model}; every number in them comes from the runner's own tools` };
  }
  return { label: 'Mock mind — rules only', claude: false,
           title: llm.key?.have ? 'GC_CHAT=mock — answered by rules over the same tools the model drives'
                                : 'No API key on the runner — answered by rules over the same tools the model drives' };
});

/** A question can be sent at all: a runner that is connected, offers chat, and has it on. */
const canSend = computed(() => live.connected && chat.available !== false && chat.on !== false);
/** The runner is writing somebody else's reply — one at a time per organisation. */
const otherTurn = computed(() => !!chat.busy && !chat.turn);

const messages = computed(() => chat.current?.messages ?? []);
const empty = computed(() => !messages.value.length && !chat.writing);

/** Three questions, and a page to test when there is one. */
const suggestions = computed(() => [
  'How many defects do we have?',
  'What were the latest scans?',
  'Which test cases are saved?',
  ...(firstPage.value ? [`Test the ${firstPage.value} page`] : []),
]);

/** A run tool is under way for this reply: the live run belongs under its tool line. */
const liveRun = computed(() => (chat.writing && chat.turn.running && live.run ? live.run : null));
const stepsDone = computed(() => liveRun.value?.steps.filter((s) => s.state !== 'idle').length ?? 0);

/** The proposal's buttons go under the message that made it, and only while it is still the one waiting. */
const awaiting = (m) => !!m.proposal && chat.current?.proposal?.id === m.proposal.id;
/** How an assistant message signs itself. */
const signed = (m) => (m.mind === 'claude' ? (m.model ?? 'Claude') : m.mind === 'mock' ? 'rules' : m.mind === 'runner' ? 'the runner' : null);

function pick(id) {
  if (!id) return chat.fresh();
  chat.open(id);
}
async function removeCurrent() {
  const c = chat.current;
  if (!c) return;
  if (!confirm(`Delete "${c.title}"? The runner forgets it too.`)) return;
  await chat.remove(c.id);
}
async function submit() {
  const text = draft.value.trim();
  if (!text || !canSend.value || chat.pending) return;
  draft.value = '';
  nextTick(grow);
  const sent = await chat.send(text);
  // A refusal keeps the words: nobody should retype a question the runner would not take.
  if (!sent && !draft.value) { draft.value = text; nextTick(grow); }
}
const ask = (text, opts) => { if (canSend.value) chat.send(text, opts); };

/** The box follows its lines, up to a height that keeps the transcript above it in view. */
function grow() {
  const el = box.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
}

// New words, ours or the runner's, keep the end of the transcript in view.
watch([() => messages.value.length, () => chat.turn?.text, () => chat.turn?.tools.length, stepsDone],
      () => nextTick(() => end.value?.scrollIntoView({ block: 'end', behavior: 'smooth' })));
</script>

<template>
  <TopBar :crumbs="[{ label: 'General' }, { label: 'Chat' }]">
    <template #actions>
      <!-- Read the value off the event, not off v-model: ConsoleView says why. -->
      <select v-if="rows.length" :value="chat.current?.id ?? ''" aria-label="Conversation"
              class="max-w-64 rounded-full border border-hairline bg-panel px-3.5 py-1.5 text-[12.5px] outline-none focus:border-ink/25"
              @change="pick($event.target.value)">
        <option value="">New conversation</option>
        <option v-for="c in rows" :key="c.id" :value="c.id">{{ c.title }} · {{ when(c.updatedAt) }}</option>
      </select>
      <button v-if="chat.current" class="rounded-full border border-hairline px-3.5 py-1.5 text-[12.5px] hover:border-ink/25"
              title="Start another conversation; this one stays in the list" @click="chat.fresh()">New</button>
      <button v-if="chat.current" class="rounded-full border border-critical/40 px-3.5 py-1.5 text-[12.5px] text-critical hover:bg-critical/5"
              title="Delete this conversation from the runner" @click="removeCurrent">Delete</button>
    </template>
  </TopBar>

  <div class="mx-auto max-w-4xl px-6 py-8">
    <HeroPanel seed="chat">
      <p class="eyebrow">Chat</p>
      <h1 class="display mt-2 max-w-2xl text-4xl">Ask the runner what it knows.</h1>
      <p class="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-2">
        Defects, runs, suites and saved cases, in words — and a case run when you name one. Every
        number comes from the runner's own records, and nothing that drives the browser happens
        without a yes from you.
      </p>
      <div v-if="mode" class="mt-4 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span class="rounded-full border px-3 py-1 font-medium"
              :class="mode.claude ? 'border-brand/20 bg-brand-50 text-brand-2' : 'border-hairline bg-panel text-ink-2'"
              :title="mode.title">{{ mode.label }}</span>
        <span v-if="mode.claude && chat.budget" class="text-ink-3">{{ chat.budget.used }}/{{ chat.budget.max }} calls today</span>
      </div>
    </HeroPanel>

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

      <!-- transcript ---------------------------------------------------- -->
      <EmptyState v-if="empty" title="Nothing asked yet"
                  body="Start with one of these, or type a question of your own. A conversation is kept on the
                        runner and picked up again from the top bar.">
        <div class="flex flex-wrap justify-center gap-2">
          <Btn v-for="s in suggestions" :key="s" variant="ghost" size="sm" :disabled="!canSend || otherTurn" @click="ask(s)">{{ s }}</Btn>
        </div>
      </EmptyState>

      <section v-else class="card p-5">
        <ol class="space-y-4">
          <li v-for="m in messages" :key="m.id" class="flex flex-col" :class="m.role === 'user' ? 'items-end' : 'items-start'">
            <div v-if="m.role === 'user'" data-message="user"
                 class="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[13.5px] leading-relaxed text-on-ink">{{ m.text }}</div>
            <!-- The runner's own short notes (mind: runner) are muted: they are
                 the engine talking, not an answer. A dead turn is red. -->
            <div v-else data-message="assistant"
                 class="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border px-4 py-2.5 text-[13.5px] leading-relaxed"
                 :class="m.error ? 'border-critical/25 bg-critical/5 text-critical'
                       : m.mind === 'runner' ? 'border-dashed border-hairline bg-ground text-ink-2'
                       : 'border-hairline bg-panel text-ink'">{{ m.text }}</div>

            <ul v-if="m.role === 'assistant' && m.tools?.length" class="mt-1.5 space-y-0.5 pl-1 font-mono text-[11.5px]">
              <li v-for="c in m.tools" :key="c.id"
                  :class="c.refused ? 'text-warn' : c.ok === false ? 'text-critical' : 'text-ink-3'">
                · {{ c.label }}<template v-if="c.summary"> — {{ c.summary }}</template>
              </li>
            </ul>
            <div v-if="m.runs?.length" class="mt-2 w-full max-w-[85%] space-y-2">
              <ChatRunCard v-for="(r, i) in m.runs" :key="`${m.id}-${i}`" :run="r" />
            </div>
            <!-- A follow-up already written: pressed rather than typed out again. -->
            <div v-if="m.offers?.length" class="mt-2 flex flex-wrap gap-1.5">
              <Btn v-for="o in m.offers" :key="o.text" variant="ghost" size="sm"
                   :disabled="!canSend || !!chat.turn || otherTurn" :title="o.text" @click="ask(o.text)">{{ o.label }}</Btn>
            </div>
            <div v-if="awaiting(m)" class="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-brand/20 bg-brand-50 px-3 py-2 text-[12.5px]">
              <span class="text-ink">Go ahead and {{ m.proposal.label }}?</span>
              <Btn size="sm" :disabled="!canSend || !!chat.turn || otherTurn" @click="ask('Yes, do it', { confirm: m.proposal.id })">Yes, do it</Btn>
              <Btn size="sm" variant="ghost" :disabled="!canSend || !!chat.turn || otherTurn" @click="ask('No, leave it')">No</Btn>
            </div>
            <p class="mt-1 text-[11px] text-ink-3">
              {{ when(m.at) }}<template v-if="m.role === 'assistant' && signed(m)"> · {{ signed(m) }}</template>
            </p>
          </li>

          <!-- The reply being written: its words as they stream, or a thought;
               its tool calls as they start and land; the run, live. -->
          <li v-if="chat.writing" class="flex flex-col items-start" data-message="writing">
            <div class="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-hairline bg-panel px-4 py-2.5 text-[13.5px] leading-relaxed text-ink">
              <template v-if="chat.turn.text">{{ chat.turn.text }}<span class="ml-0.5 inline-block h-[1em] w-0.5 translate-y-0.5 animate-pulse bg-ink" aria-hidden="true" /></template>
              <span v-else class="text-ink-3">Thinking…</span>
            </div>
            <ul v-if="chat.turn.tools.length" class="mt-1.5 space-y-0.5 pl-1 font-mono text-[11.5px]">
              <li v-for="c in chat.turn.tools" :key="c.id" class="flex items-center gap-1.5"
                  :class="c.state === 'error' ? 'text-critical' : 'text-ink-3'">
                <svg v-if="c.state === 'start'" class="size-3 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity=".25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                </svg>
                <span v-else aria-hidden="true">·</span>
                <span>{{ c.label }}<template v-if="c.summary"> — {{ c.summary }}</template></span>
              </li>
            </ul>
            <div v-if="liveRun" class="mt-2 w-full max-w-[85%]">
              <ChatRunCard :live="liveRun" />
              <p v-if="live.suiteRun" class="mt-1 text-[11.5px] text-ink-3">
                {{ live.suiteRun.done }} of {{ live.suiteRun.cases }} cases so far, {{ live.suiteRun.passed }} passed
              </p>
            </div>
          </li>
        </ol>
        <div ref="end" />
      </section>

      <!-- composer ------------------------------------------------------ -->
      <section class="card mt-4 p-3">
        <textarea ref="box" v-model="draft" rows="2" :maxlength="TEXT_MAX" aria-label="Your question"
                  :placeholder="canSend ? 'Ask about defects, runs, suites — or name a page to test'
                              : live.connected ? 'Chat is not available on this runner' : 'Runner offline'"
                  :disabled="!canSend"
                  class="block w-full resize-none bg-transparent px-2 py-1.5 text-[13.5px] leading-relaxed text-ink outline-none
                         placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60"
                  @input="grow" @keydown.enter.exact.prevent="submit"></textarea>
        <div class="flex flex-wrap items-center gap-2 px-2 pb-1 pt-1">
          <span class="text-[11.5px] text-ink-3">Enter sends · Shift+Enter for a new line</span>
          <span v-if="draft.length >= TEXT_MAX - 200" class="text-[11.5px] tabular-nums text-ink-3">{{ draft.length }}/{{ TEXT_MAX }}</span>
          <span v-if="otherTurn" class="text-[11.5px] text-ink-3">A reply is being written…</span>
          <Btn class="ml-auto" :busy="!!chat.turn" busy-label="Answering…"
               :disabled="!canSend || !draft.trim() || otherTurn" @click="submit">Send</Btn>
        </div>
        <p v-if="chat.error" class="mx-2 mb-1 mt-2 rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">
          {{ chat.error }}
        </p>
      </section>
    </template>
  </div>
</template>
