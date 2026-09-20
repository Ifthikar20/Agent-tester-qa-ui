<script setup>
/**
 * "What do you want to test?"
 *
 * The first test is the hardest thing to start, because an empty state can only
 * tell you what a test IS — and what you actually want is somewhere to type. So
 * this is that: a prompt, over whatever page you pressed it from.
 *
 * Three ways out of it, and they differ in WHEN the thinking happens rather
 * than in how clever they are:
 *
 *   draft    now, once. The runner walks the site (explore.js — by address
 *            only, pressing nothing), picks the page the request was about, and
 *            writes concrete steps you can read before you trust them. What you
 *            get is an ordinary test, and this is the one most people want.
 *   agent    every time it runs. The sentence is saved as a `goal` step and the
 *            runner works the moves out against the page in front of it
 *            (agent.js). Survives a redesign that would break a recorded click;
 *            costs a model call per step.
 *   explore  nothing is saved. The runner walks the site and reports what is
 *            worth testing. Research, not a test — it is how you decide what to
 *            write, and it goes through the chat because a crawl of somebody's
 *            site is a thing to say yes to.
 *
 * The first two used to be one tab that quietly did the second, and before that
 * a tab that handed the sentence to the chat and left you reading four
 * approvals. Naming them by what you GET is the point: "describe a test" and
 * "use an AI agent" are the same sentence to the person typing, and the real
 * difference — fixed steps now, or decided later — is what the words under each
 * tab have to say.
 *
 * Drafting holds the browser for the better part of a minute, so it reports as
 * it goes (`live.draft`, from the runner's `draft.*` events). A spinner looks
 * identical whether it is walking a site or wedged.
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useChatStore } from '@/stores/chat';
import { useSuites } from '@/stores/suites';
import { useLive } from '@/stores/live';
import { api } from '@/api';
import Btn from '@/components/Btn.vue';

const props = defineProps({
  /** The suite this was opened from, when it was: its name and address give the prompt somewhere to point. */
  suite: { type: Object, default: null },
});
const emit = defineEmits(['close']);

const router = useRouter();
const chat = useChatStore();
const suites = useSuites();
const live = useLive();

const MODES = [
  ['draft', 'Draft the steps', 'The runner reads your site now and writes the steps down. You get a test you can read.'],
  ['agent', 'Let it work it out', 'The sentence is the test. The runner decides each move against the page, every run.'],
  ['explore', 'Explore the site', 'No test is saved. The runner walks the site and says what is worth testing.'],
];
const mode = ref('draft');
const modeHint = computed(() => MODES.find(([m]) => m === mode.value)?.[2] ?? '');

const text = ref('');
/**
 * "And then check that…", for the agent mode only, and the only thing that
 * makes its result a verdict about the site.
 *
 * A drafted test does not need it — drafting writes its own assertions, and
 * `compile()` refuses a candidate that checks nothing. A goal has no
 * assertions of its own, so without this it passes when the runner could carry
 * the flow out, which is a real answer and NOT the same claim as "the flow is
 * right". Said under the box rather than enforced, because demanding it would
 * mean nobody adds the first test.
 */
const check = ref('');
const box = ref(null);
const sending = ref(false);
const error = ref(null);

onMounted(() => nextTick(() => box.value?.focus()));

const site = computed(() => props.suite?.baseUrl ?? null);
/** A suite to write into, and an address to read. Without both, only the chat can help. */
const here = computed(() => Boolean(props.suite?.id && props.suite?.baseUrl));

/** Something worth typing, for somebody looking at an empty box. */
const EXAMPLES = [
  'Sign in as an existing user and check the dashboard loads',
  'Fill in the contact form and check it says it was sent',
  'Search for a product and open the first result',
];
const example = ref(EXAMPLES[0]);
function useExample() {
  const i = EXAMPLES.indexOf(example.value);
  text.value = example.value;
  example.value = EXAMPLES[(i + 1) % EXAMPLES.length];
  box.value?.focus();
}

const canSend = computed(() => (mode.value === 'explore' ? !!site.value : !!text.value.trim()) && !sending.value);

/**
 * What the chat is asked, for the one mode that still goes through it.
 *
 * The address matters: without one, "test the sign-in" can only look through
 * what this organisation has already saved, and the whole point of starting
 * here is that it has not saved anything yet.
 */
const asked = computed(() => {
  const said = text.value.trim();
  const inSuite = props.suite?.name ? ` in the suite "${props.suite.name}"` : '';
  if (mode.value === 'explore') return `research ${site.value} and find the pages worth testing${said ? `, especially ${said}` : ''}${inSuite}`;
  if (!said) return '';
  if (/https?:\/\//.test(said) || !site.value) return said;
  return `${said} at ${site.value}${inSuite}`;
});

/** Land on the new test rather than back on the list: the next thing anybody wants is to read it. */
async function openTest(testId) {
  // The suite in the store is now a case short, and the sidebar's count and the
  // crumb that names this test both read it.
  await suites.load(props.suite.id).catch(() => null);
  emit('close');
  await router.push({ name: 'suite-test', params: { id: props.suite.id, testId } });
}

async function go() {
  if (!canSend.value) return;
  sending.value = true;
  error.value = null;
  live.draft = null;
  try {
    if (mode.value === 'draft' && here.value) {
      const r = await api.draftTest(props.suite.id, { goal: text.value.trim() });
      await openTest(r.test.id);
      return;
    }
    if (mode.value === 'agent' && here.value) {
      const r = await api.createTest(props.suite.id, { goal: text.value.trim(), check: check.value.trim() });
      await openTest(r.case.id);
      return;
    }
    // Explore, or anything asked with no suite to put it in: the chat can find
    // a site and make one.
    chat.fresh();
    await router.push('/chat');
    await nextTick();
    await chat.send(asked.value);
    emit('close');
  } catch (e) {
    // The runner's own sentence. It knows that an origin is not allowed, that a
    // goal may not carry a quote, that nothing on the page could be read — and
    // every one of those is something a person can act on.
    error.value = e.message;
    if (e.needsOrigin) live.needsOrigin = { origin: e.needsOrigin };
  } finally { sending.value = false; }
}

/** What the runner is doing right now, while a draft is under way. */
const working = computed(() => sending.value && mode.value === 'draft' && here.value);
const MARK = { done: '✓', doing: '·' };
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4" role="dialog" aria-modal="true"
       aria-label="What do you want to test?" @click.self="!sending && emit('close')" @keydown.esc="!sending && emit('close')">
    <div class="w-full max-w-xl rounded-2xl border border-hairline bg-panel p-6 shadow-xl">
      <div class="flex items-start gap-3">
        <div class="min-w-0">
          <h2 class="text-[17px] font-medium">What do you want to test?</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-ink-2">{{ modeHint }}</p>
        </div>
        <button type="button" :disabled="sending"
                class="ml-auto shrink-0 rounded-md px-2 py-1 text-[18px] leading-none text-ink-3 hover:bg-ink/[0.05] hover:text-ink disabled:opacity-40"
                aria-label="Close" @click="emit('close')">×</button>
      </div>

      <!-- While it works, the form is replaced by what it is doing. The same
           box, because this IS the answer to what was typed in it — and a
           person watching a browser think for forty seconds should be able to
           see which part it is on. -->
      <template v-if="working">
        <ol class="mt-5 space-y-2.5">
          <li v-for="l in (live.draft?.lines ?? [])" :key="l.key" class="flex items-start gap-2.5 text-[13px]">
            <span class="w-4 shrink-0 text-center" :class="l.state === 'done' ? 'text-good' : 'text-brand'">
              <span v-if="l.state !== 'done'" class="inline-block animate-pulse">·</span>
              <template v-else>{{ MARK.done }}</template>
            </span>
            <span class="min-w-0 flex-1 break-words" :class="l.state === 'done' ? 'text-ink-2' : 'text-ink'">{{ l.text }}</span>
          </li>
          <li v-if="!(live.draft?.lines ?? []).length" class="text-[13px] text-ink-3">Taking the browser…</li>
        </ol>
        <p class="mt-4 text-[12px] text-ink-3">
          It reads the site by address and presses nothing while it looks. This takes about a minute.
        </p>
      </template>

      <template v-else>
        <div class="mt-4 flex gap-1 rounded-full border border-hairline p-1">
          <button v-for="[m, label] in MODES" :key="m" type="button"
                  class="flex-1 rounded-full px-3 py-1.5 text-[12.5px]"
                  :class="mode === m ? 'bg-brand-50 font-medium text-brand-2' : 'text-ink-2 hover:text-ink'"
                  :aria-pressed="mode === m" @click="mode = m">{{ label }}</button>
        </div>

        <template v-if="mode === 'explore'">
          <p v-if="site" class="mt-3 rounded-xl border border-hairline bg-ground px-3.5 py-3 text-[13.5px] leading-relaxed text-ink-2">
            The runner will open <span class="font-mono text-[12.5px]">{{ site }}</span>, walk its own pages without
            pressing anything, and keep the ones worth testing. Say below what matters most, or leave it empty.
          </p>
          <p v-else class="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[12.5px] text-warn">
            Open this from a project with an address, or describe a test and name the site in it.
          </p>
          <textarea v-if="site" v-model="text" rows="2" maxlength="2000"
                    class="mt-2 w-full resize-none rounded-xl border border-hairline bg-ground px-3.5 py-3 text-[13.5px] leading-relaxed"
                    placeholder="signing in, or checkout — optional"
                    @keydown.enter.exact.prevent="go()" />
        </template>

        <template v-else>
          <textarea ref="box" v-model="text" rows="4" maxlength="2000"
                    class="mt-3 w-full resize-none rounded-xl border border-hairline bg-ground px-3.5 py-3 text-[13.5px] leading-relaxed"
                    placeholder="Sign in as a student and check the dashboard loads"
                    @keydown.enter.exact.prevent="go()" />

          <!-- Only the agent mode needs this: a drafted test writes its own
               checks, and compile() refuses a candidate that checks nothing. -->
          <template v-if="mode === 'agent' && here">
            <input v-model="check" maxlength="200" type="text"
                   class="mt-2 w-full rounded-xl border border-hairline bg-ground px-3.5 py-2.5 text-[13.5px]"
                   placeholder="…and then check the page says (optional)"
                   @keydown.enter.exact.prevent="go()">
            <p class="mt-2 text-[12.5px] leading-relaxed text-ink-3">
              <template v-if="check.trim()">It passes when the runner gets there and the page shows those words.</template>
              <template v-else>With no check it passes when the runner could carry the flow out — which is worth knowing, and is not the same as the flow being right.</template>
            </p>
          </template>

          <p class="mt-2 text-[12.5px] text-ink-3">
            Enter sends · Shift+Enter for a new line ·
            <button type="button" class="underline decoration-hairline underline-offset-2 hover:text-ink" @click="useExample">try an example</button>
          </p>
        </template>
      </template>

      <p v-if="error" class="mt-3 rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">{{ error }}</p>

      <div v-if="!working" class="mt-4 flex items-center gap-2">
        <p v-if="site && mode !== 'explore'" class="truncate text-[12.5px] text-ink-3">on {{ site }}</p>
        <button type="button" class="ml-auto rounded-full border border-hairline px-4 py-2 text-[13px] hover:border-ink/25"
                @click="emit('close')">Cancel</button>
        <!-- The label says which of the three things this press does, because
             they are three different things: read the site and write a test,
             save the sentence as the test, or go and look around. -->
        <Btn :disabled="!canSend" :busy="sending" busy-label="Working…" @click="go">
          {{ mode === 'explore' ? 'Explore it' : mode === 'agent' && here ? 'Add the test' : 'Draft it' }}
        </Btn>
      </div>
    </div>
  </div>
</template>
