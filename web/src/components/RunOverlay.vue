<script setup>
/**
 * The run, taking over the screen.
 *
 * A run is the moment the product is actually doing its job, and until now you
 * could only watch it from the console — the one page that happens to have a
 * canvas. Start a run from a suite, from the chat, from anywhere, and the
 * thing you most wanted to see was on another page.
 *
 * So: while a run is going, this. The steps down the left with what each one
 * did underneath it, the driven browser on the right, how long it has been
 * going at the foot, and a way out. It draws only what the runner reports —
 * `run.start` brings the whole plan, so every step has its words before it
 * runs and a row the run never reaches still says what it would have done.
 *
 * Closing it does not stop the run. Those are two different intentions and
 * conflating them would mean the only way to stop watching was to stop
 * working; the button that stops the run says so.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useLive } from '@/stores/live';

import { showAction, labelAction, sayAction } from '@lang';
import Stage from '@/components/Stage.vue';

const live = useLive();


/** Dismissed by hand for THIS run: the next one opens it again. */
const hidden = ref(false);
const open = computed(() => !!live.run && !hidden.value);
watch(() => live.run, (r, was) => { if (r && r !== was) hidden.value = false; });

/** Seconds since the run began, ticking while it is going. */
const now = ref(Date.now());
const timer = setInterval(() => { now.value = Date.now(); }, 250);
onBeforeUnmount(() => clearInterval(timer));
const elapsed = computed(() => {
  const ms = Math.max(0, now.value - (live.run?.at ?? now.value));
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
});

const steps = computed(() => live.run?.steps ?? []);
const done = computed(() => steps.value.filter((s) => s.state === 'pass' || s.state === 'fail').length);
const failed = computed(() => steps.value.some((s) => s.state === 'fail'));
const over = computed(() => !live.running);
/** Somebody ended it. Neither a pass nor a failure, and drawn as neither. */
const stopped = computed(() => live.run?.stopped === true);

/**
 * Two ways to read the same step, both from the vocabulary rather than from a
 * fourth opinion about how a step reads.
 *
 * The sentence is what somebody watching a run wants: "Click the first 'Blog'
 * link", not `click 'Blog' : nth1/link`. The script is what somebody editing
 * the case wants, and it is exact. So the sentence leads and the script sits
 * under it in the type it is written in — nobody has to learn the grammar to
 * follow a run, and nobody loses it who already has.
 */
const cap = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));
function describe(s) {
  if (!s) return '';
  try { return sayAction(s); }
  catch { return `${s.op} ${s.target ?? s.value ?? s.url ?? ''}`.trim(); }
}
function script(s) {
  if (!s) return '';
  try { return showAction(s) ?? labelAction(s, (t, n) => cap(t, Math.max(n, 40))); }
  catch { return ''; }
}

const GLYPH = { pass: '✓', fail: '✕', run: '·', idle: '' };
const TONE = { pass: 'text-good', fail: 'text-critical', run: 'text-brand', idle: 'text-ink-3' };

/**
 * A decision, by what kind of decision it was (agent.js `say`).
 *
 * `do` is a move it made and is the ordinary case, so it gets the ordinary
 * colour and an arrow. The others are the ones worth finding in a long
 * transcript afterwards: `refused` is the runner declining to press something
 * the goal did not ask for, `stuck` is it saying the goal cannot be reached,
 * `note` is a move that did not work or an answer it threw away, and `ask` and
 * `answer` are the two halves of the moment a person was in the loop — the
 * first thing anybody scrolls back to find.
 */
const ACT_TONE = { do: 'text-ink-2', done: 'text-good', refused: 'text-warn', stuck: 'text-warn', note: 'text-ink-3', ask: 'text-warn', answer: 'text-ink' };
const ACT_MARK = { do: '→', done: '✓', refused: '⊘', stuck: '⊘', note: '·', ask: '?', answer: '↳' };

/** Whether this run is working its steps out or replaying them (stores/live.js). */
const agentic = computed(() => live.run?.mode === 'agentic');

/**
 * Answering the question a run has stopped on.
 *
 * The field is cleared on the way out rather than on the way back, so a
 * refused answer — the question timed out while it was being typed — leaves
 * the words where they were typed rather than throwing them away along with
 * the attempt.
 */
const said = ref('');
const answering = ref(false);
const reply = ref(null);
watch(() => live.question, (q) => { if (q) { said.value = ''; nextTick(() => reply.value?.[0]?.focus?.() ?? reply.value?.focus?.()); } });
async function answer(opts = {}) {
  if (answering.value) return;
  answering.value = true;
  try { await live.answerRun({ text: said.value.trim(), ...opts }); said.value = ''; }
  catch { /* the store said why in the log; the words stay in the box */ }
  finally { answering.value = false; }
}

/** Keep the running step in view without yanking the list while you read it. */
const list = ref(null);
watch(() => steps.value.findIndex((s) => s.state === 'run'), (i) => {
  if (i < 0 || !list.value) return;
  const row = list.value.querySelector(`[data-step="${i}"]`);
  row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
</script>

<template>
  <!-- `fixed inset-0` over everything, including the sidebar: a run is the one
       thing worth the whole screen. Escape closes the window, not the run. -->
  <div v-if="open" class="fixed inset-0 z-50 flex flex-col bg-ground" role="dialog" aria-modal="true"
       :aria-label="`Running ${live.run.caseName ?? live.run.suite}`" tabindex="-1" @keydown.esc="hidden = true">
    <header class="flex shrink-0 items-center gap-3 border-b border-hairline px-5 py-3">
      <h2 class="truncate text-[15px] font-medium">{{ live.run.caseName ?? live.run.suite }}</h2>
      <span v-if="live.run.caseName && live.run.suite" class="truncate text-[12.5px] text-ink-3">{{ live.run.suite }}</span>
      <!-- A suite is several cases and the overlay shows one at a time, so say
           which one this is. Without it a run that flips to the next case looks
           like the same run starting over. -->
      <span v-if="live.suiteRun" class="shrink-0 rounded-full border border-hairline px-2.5 py-1 text-[11.5px] tabular-nums text-ink-2"
            :title="`${live.suiteRun.passed} passed so far`">
        case {{ Math.min(live.suiteRun.done + 1, live.suiteRun.cases) }} of {{ live.suiteRun.cases }}
      </span>
      <!-- Which promise this run is making. A replay says nothing, because
           that is what a run has always been; a run that is deciding its own
           moves says so where the outcome is read, since every line of the
           transcript below has to be taken differently. -->
      <span v-if="agentic" class="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-medium text-brand-2"
            title="The runner is reading the page and deciding each move itself">agentic</span>
      <span class="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
            :class="stopped ? 'bg-warn/10 text-warn' : failed ? 'bg-critical/10 text-critical' : over ? 'bg-good/10 text-good' : 'bg-brand-50 text-brand-2'">
        {{ stopped ? 'stopped' : failed ? 'failed' : over ? 'passed' : 'running' }}
      </span>
      <button type="button" class="shrink-0 rounded-md px-2 py-1 text-[18px] leading-none text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
              title="Close this window — the run carries on" aria-label="Close" @click="hidden = true">×</button>
    </header>

    <div class="flex min-h-0 flex-1">
      <!-- the transcript -->
      <div ref="list" class="w-[42%] min-w-[320px] max-w-[560px] overflow-y-auto border-r border-hairline">
        <p class="eyebrow px-5 pb-1 pt-4">Transcript · {{ done }}/{{ steps.length }} steps</p>
        <ol class="px-2 pb-6">
          <li v-for="s in steps" :key="s.i" :data-step="s.i"
              class="rounded-lg px-3 py-2" :class="s.state === 'run' && 'bg-brand-50/60'">
            <div class="flex gap-2.5 text-[13px]">
              <span class="w-5 shrink-0 text-right tabular-nums text-ink-3">{{ s.i + 1 }}</span>
              <span class="w-3.5 shrink-0" :class="TONE[s.state]">
                <span v-if="s.state === 'run'" class="inline-block animate-pulse">·</span>
                <template v-else>{{ GLYPH[s.state] }}</template>
              </span>
              <span class="min-w-0 flex-1 break-words" :class="s.state === 'idle' && 'text-ink-3'">
                {{ describe(s.step) }}
                <span v-if="script(s.step)" class="mt-0.5 block font-mono text-[11.5px] text-ink-3">{{ script(s.step) }}</span>
              </span>
              <span v-if="s.ms != null" class="shrink-0 tabular-nums text-[12px] text-ink-3">{{ s.ms }}ms</span>
            </div>

            <!-- What the runner DECIDED to do inside this step, when it was
                 the one working it out (agent.js).
                 Above the log lines and marked with a rule, because these are
                 a different kind of sentence: a move the product chose, not a
                 line it happened to print. Each is drawn as it is made, so the
                 column fills while you watch — which is the whole of what
                 there is to see during a step that takes ten seconds. -->
            <ul v-if="s.acts?.length" class="ml-[2.6rem] mt-1.5 space-y-1 border-l border-hairline pl-3">
              <li v-for="a in s.acts" :key="a.id" class="break-words text-[12.5px] leading-relaxed">
                <span :class="ACT_TONE[a.kind] ?? (a.level === 'warn' ? 'text-warn' : 'text-ink-2')">
                  <span v-if="ACT_MARK[a.kind]" class="mr-1 text-ink-3" aria-hidden="true">{{ ACT_MARK[a.kind] }}</span>{{ a.text }}
                </span>
                <!-- Why, in its own words, in the smaller type: the move is
                     what happened and the reason is what somebody asks about
                     it afterwards. -->
                <span v-if="a.why" class="mt-0.5 block text-[11.5px] text-ink-3">{{ a.why }}</span>
              </li>
            </ul>

            <!-- What the step did, in the runner's own words: the lines it
                 emitted while it was the running one. -->
            <ul v-if="s.said?.length" class="ml-[2.6rem] mt-1 space-y-0.5">
              <li v-for="l in s.said" :key="l.id" class="break-words text-[12px] leading-relaxed"
                  :class="l.level === 'error' ? 'text-critical' : l.level === 'warn' ? 'text-warn' : 'text-ink-3'">
                {{ l.msg }}
              </li>
            </ul>
            <!-- The run has stopped to ask, and is holding the browser until
                 it is answered. Drawn under the step that asked rather than as
                 a dialog: the answer is about the page on the right, and a box
                 over the top of it would cover the only evidence there is. -->
            <form v-if="live.question && live.question.i === s.i"
                  class="ml-[2.6rem] mt-2 rounded-xl border border-warn/40 bg-warn/5 p-3" @submit.prevent="answer()">
              <p class="text-[12.5px] font-medium text-warn">{{ live.question.text }}</p>
              <input ref="reply" v-model="said" maxlength="200" :disabled="answering"
                     class="mt-2 w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-[12.5px]"
                     placeholder="Type an answer — a value to use, or which way to go">
              <div class="mt-2 flex items-center gap-2">
                <!-- Saying no IS an answer, and a first-class one: sometimes
                     the honest outcome of a test is a person looking at the
                     page and deciding it has failed. -->
                <button type="button" :disabled="answering"
                        class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px] hover:border-ink/25"
                        @click="answer({ giveUp: true })">Mark it failed</button>
                <button type="submit" :disabled="answering || !said.trim()"
                        class="ml-auto rounded-full bg-brand px-3.5 py-1.5 text-[12.5px] font-medium text-on-ink disabled:opacity-50">
                  {{ answering ? 'Sending…' : 'Answer' }}
                </button>
              </div>
            </form>

            <p v-if="s.error" class="ml-[2.6rem] mt-1 whitespace-pre-wrap break-words rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">
              {{ s.error }}
            </p>
          </li>
        </ol>
      </div>

      <!-- the page it is driving -->
      <div class="flex min-w-0 flex-1 flex-col bg-panel p-4">
        <p class="mb-2 truncate font-mono text-[12px] text-ink-3">{{ live.url ?? 'nothing open' }}</p>
        <!-- Watching, not driving. The canvas forwards clicks and keys to the
             real page, and a stray click during a run would be a real click on
             somebody's site in the middle of a test — so while the run is going
             the surface is sealed. Once it is over the page is yours again. -->
        <div class="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-hairline">
          <Stage />
          <div v-if="!over" class="absolute inset-0" title="The runner is driving this page" />
        </div>
      </div>
    </div>

    <footer class="flex shrink-0 items-center gap-3 border-t border-hairline px-5 py-3">
      <span class="text-[13px] text-ink-2">
        <template v-if="live.stopping">Stopping after this step… <span class="tabular-nums">{{ elapsed }}</span></template>
        <template v-else-if="!over">Testing your site… <span class="tabular-nums">{{ elapsed }}</span></template>
        <template v-else>{{ stopped ? 'Stopped — the steps after it did not run.' : failed ? 'Stopped at a failed step.' : 'Every step passed.' }} <span class="tabular-nums">{{ elapsed }}</span></template>
      </span>
      <!-- Two buttons that do two different things, and the difference is the
           whole reason both exist: Hide puts the window away and the run
           carries on, Stop ends the run. Conflating them would mean the only
           way to stop watching was to stop working. -->
      <button v-if="!over" type="button" class="ml-auto rounded-full border border-hairline px-4 py-2 text-[13px] hover:border-ink/25"
              title="Closes this window; the run carries on" @click="hidden = true">Hide</button>
      <!-- A step cannot be interrupted — it is a browser call already in
           flight — so this says what it will actually do rather than promising
           an instant stop it cannot deliver. -->
      <button v-if="!over" type="button" :disabled="live.stopping"
              class="rounded-full border border-critical/40 px-4 py-2 text-[13px] text-critical hover:bg-critical/5 disabled:opacity-50"
              :title="live.stopping ? 'Already stopping — the step in flight has to finish' : 'Ends the run after the step it is on'"
              @click="live.stopRun()">{{ live.stopping ? 'Stopping…' : 'Stop test' }}</button>
      <button v-else type="button" class="ml-auto rounded-full border border-hairline px-4 py-2 text-[13px] hover:border-ink/25"
              @click="hidden = true">Close</button>
    </footer>
  </div>
</template>
