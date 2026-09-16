<script setup>
/**
 * Request help & support.
 *
 * One small form — a topic and a message — and one consequence the sentence
 * under it spells out: sending turns on support access for the organisation,
 * so whoever operates the runner knows this person is happy to be looked at.
 * The same sheet is where it is turned off again. The runner keeps the
 * request (support.js) and says so on its console; the top bar's button
 * follows the runner's answer, never its own guess.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { useUi } from '@/stores/ui';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';

const route = useRoute();
const live = useLive();
const ui = useUi();

const TOPICS = [
  ['question', 'A question'],
  ['bug', 'Something is broken'],
  ['access', 'Access or sign-in'],
  ['billing', 'Plan or billing'],
  ['other', 'Something else'],
];
const topic = ref('question');
const message = ref('');
const busy = ref(false);
const error = ref('');
const sent = ref(null);         // the request the runner recorded, for the confirmation
const turningOff = ref(false);

const enabled = computed(() => !!live.support.enabled);
const since = computed(() => (live.support.since ? new Date(live.support.since).toLocaleString() : null));

async function send() {
  error.value = '';
  if (!message.value.trim()) { error.value = 'Say what you need help with.'; return; }
  busy.value = true;
  try {
    const r = await api.requestSupport({ topic: topic.value, message: message.value.trim(), page: route.fullPath });
    live.support = { enabled: !!r.enabled, since: r.since ?? null };
    sent.value = r.request;
    message.value = '';
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
async function turnOff() {
  error.value = '';
  turningOff.value = true;
  try {
    const r = await api.disableSupport();
    live.support = { enabled: !!r.enabled, since: r.since ?? null };
    sent.value = null;
  } catch (e) { error.value = e.message; }
  finally { turningOff.value = false; }
}

function onKey(e) { if (e.key === 'Escape') ui.closeSupport(); }
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="fixed inset-0 z-30 grid place-items-center bg-ink/40 px-6" @click.self="ui.closeSupport()">
    <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-labelledby="support-title">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2 id="support-title" class="text-[16px] font-medium">Help &amp; support</h2>
          <p v-if="enabled" class="mt-1 flex items-center gap-2 text-[13px] text-ink-2">
            <span class="size-1.5 rounded-full bg-good" />
            Support access is on<template v-if="since"> since {{ since }}</template>.
          </p>
          <p v-else class="mt-1 text-[13px] leading-relaxed text-ink-2">
            Tell us what you are trying to do and what happened. Sending turns on support access for
            your organisation, so whoever operates this runner knows to look.
          </p>
        </div>
        <button type="button" class="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
                aria-label="Close" title="Close (Esc)" @click="ui.closeSupport()">
          <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <p v-if="sent" class="mt-4 rounded-lg border border-good/30 bg-good/5 px-3 py-2 text-[12.5px] text-ink">
        Sent. Your request is with the people who run this runner
        <template v-if="sent.id"> (ref <span class="font-mono">{{ sent.id }}</span>)</template>.
      </p>

      <form class="mt-4 space-y-3" @submit.prevent="send">
        <Field label="What is it about?">
          <select v-model="topic">
            <option v-for="[v, l] in TOPICS" :key="v" :value="v">{{ l }}</option>
          </select>
        </Field>
        <Field label="What happened?" hint="What you were doing, what you expected, what you saw. The page you are on is sent along.">
          <textarea v-model="message" rows="4" placeholder="e.g. The run stops at step 3 with “no element” on the sign-in page since this morning."></textarea>
        </Field>
        <p v-if="error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ error }}</p>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <Btn v-if="enabled" variant="ghost" size="sm" :busy="turningOff" busy-label="Turning off…"
               title="Support access off for this organisation; requests already sent are kept" @click="turnOff">
            Turn off support access
          </Btn>
          <Btn type="submit" :busy="busy" busy-label="Sending…" :disabled="!message.trim()">
            {{ enabled ? 'Send another request' : 'Send request' }}
          </Btn>
        </div>
      </form>
    </div>
  </div>
</template>
