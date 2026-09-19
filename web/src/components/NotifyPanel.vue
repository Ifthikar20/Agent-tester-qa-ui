<script setup>
/**
 * Where the runner tells somebody: the organisation's channels — a webhook,
 * a Slack incoming webhook, an email through the operator's relay — each
 * with the events it wants, a Test button, a switch and a way out. Managers
 * set them; everyone sees them. The runner keeps them (notify.js) and never
 * hands a secret or a full address back: a channel is shown by its host.
 */
import { computed, ref } from 'vue';
import { api } from '@/api';
import { useSession } from '@/stores/session';
import { when } from '@/time';
import Btn from '@/components/Btn.vue';

const session = useSession();
const state = ref(null);      // { channels, events: { key: words }, smtp: bool, kinds }
const error = ref(null);
const testing = ref(new Set());
const tested = ref({});       // id → { ok, error }
const kind = ref('webhook');
const url = ref('');
const to = ref('');
const secret = ref('');
const name = ref('');
const events = ref(['incident', 'run_failed', 'defect']);
const adding = ref(false);
const addError = ref(null);

const channels = computed(() => state.value?.channels ?? []);
const eventList = computed(() => Object.entries(state.value?.events ?? {}));
const KIND_WORDS = { webhook: 'Webhook', slack: 'Slack', email: 'Email' };

async function load() {
  try { state.value = await api.notify(); error.value = null; }
  catch (e) { error.value = e.message; }
}
load();

async function add() {
  adding.value = true;
  addError.value = null;
  try {
    await api.createChannel({ kind: kind.value, url: url.value, to: to.value, secret: secret.value, name: name.value, events: events.value });
    url.value = ''; to.value = ''; secret.value = ''; name.value = '';
    await load();
  } catch (e) { addError.value = e.body?.error ?? e.message; }
  finally { adding.value = false; }
}
async function toggle(c) { try { await api.updateChannel(c.id, { enabled: !c.enabled }); await load(); } catch (e) { error.value = e.message; } }
async function remove(c) { try { await api.removeChannel(c.id); await load(); } catch (e) { error.value = e.message; } }
async function test(c) {
  testing.value = new Set([...testing.value, c.id]);
  try { const r = await api.testChannel(c.id); tested.value = { ...tested.value, [c.id]: r.result ?? r }; await load(); }
  catch (e) { tested.value = { ...tested.value, [c.id]: { ok: false, error: e.body?.error ?? e.message } }; }
  finally { testing.value = new Set([...testing.value].filter((x) => x !== c.id)); }
}
function toggleEvent(key) {
  events.value = events.value.includes(key) ? events.value.filter((e) => e !== key) : [...events.value, key];
}
</script>

<template>
  <section class="card mb-4 p-5" data-notify>
    <h2 class="text-[15px] font-medium">Notifications</h2>
    <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
      Where an incident, a failed run or a defect is told when nobody has this page open: a webhook (JSON,
      signed when you give it a secret), a Slack incoming webhook, or an email. Every word is redacted
      against the vault first. A channel that fails is retried three times and then says why here.
    </p>
    <p v-if="error" class="mt-2 text-[12.5px] text-critical">{{ error }}</p>

    <ul v-if="channels.length" class="mt-4 divide-y divide-hairline border-y border-hairline">
      <li v-for="c in channels" :key="c.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5" :class="!c.enabled && 'opacity-60'">
        <input v-if="session.manages" type="checkbox" :checked="c.enabled" class="size-3.5 shrink-0 accent-brand" :title="c.enabled ? 'On — switch it off' : 'Off — switch it on'" @change="toggle(c)">
        <div class="min-w-0 flex-1">
          <p class="truncate text-[13.5px]">{{ c.name }} <span class="text-ink-3">· {{ KIND_WORDS[c.kind] }} · {{ c.where }}{{ c.signed ? ' · signed' : '' }}</span></p>
          <p class="truncate text-[11.5px]" :class="c.lastError ? 'text-critical' : 'text-ink-3'">
            {{ c.events.map((e) => state.events[e] ?? e).join(', ') }}
            <template v-if="c.lastSentAt"> · last sent {{ when(c.lastSentAt) }}</template>
            <template v-if="c.lastError"> · {{ c.lastError }}</template>
            <template v-if="tested[c.id]"> · test: {{ tested[c.id].ok ? 'delivered' : tested[c.id].error }}</template>
          </p>
        </div>
        <span class="shrink-0 tabular-nums text-[11.5px] text-ink-3">{{ c.sent }} sent{{ c.failed ? `, ${c.failed} failed` : '' }}</span>
        <Btn v-if="session.manages" variant="ghost" size="sm" :disabled="testing.has(c.id)" @click="test(c)">{{ testing.has(c.id) ? 'Sending…' : 'Test' }}</Btn>
        <button v-if="session.manages" type="button" class="text-ink-3 hover:text-critical" :aria-label="`Remove ${c.name}`" :title="`Remove ${c.name}`" @click="remove(c)">✕</button>
      </li>
    </ul>
    <p v-else-if="state" class="mt-4 text-[13px] text-ink-3">Nobody is told yet.</p>

    <form v-if="session.manages && state" class="mt-4 flex flex-wrap items-end gap-2" @submit.prevent="add">
      <label class="flex flex-col gap-1 text-[11.5px] text-ink-3">
        Kind
        <select v-model="kind" class="rounded-lg border border-hairline bg-panel px-2.5 py-1.5 text-[13px] text-ink">
          <option value="webhook">Webhook</option>
          <option value="slack">Slack</option>
          <option value="email" :disabled="!state.smtp">Email{{ state.smtp ? '' : ' (no relay on this runner)' }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-[11.5px] text-ink-3">
        Name (optional)
        <input v-model="name" maxlength="60" class="w-40 rounded-lg border border-hairline bg-panel px-2.5 py-1.5 text-[13px] text-ink" :placeholder="KIND_WORDS[kind]">
      </label>
      <label v-if="kind === 'webhook'" class="flex flex-col gap-1 text-[11.5px] text-ink-3">
        Secret (optional, signs each post)
        <input v-model="secret" type="password" autocomplete="off" class="w-44 rounded-lg border border-hairline bg-panel px-2.5 py-1.5 text-[13px] text-ink">
      </label>
      <!-- The address on a row of its own: it is the long one, and the one to read back. -->
      <label v-if="kind !== 'email'" class="flex basis-full flex-col gap-1 text-[11.5px] text-ink-3">
        {{ kind === 'slack' ? 'Incoming webhook address' : 'Address' }}
        <input v-model="url" class="w-full rounded-lg border border-hairline bg-panel px-2.5 py-1.5 font-mono text-[12.5px] text-ink" spellcheck="false"
               :placeholder="kind === 'slack' ? 'https://hooks.slack.com/services/…' : 'https://…'">
      </label>
      <label v-else class="flex basis-full flex-col gap-1 text-[11.5px] text-ink-3">
        To (up to five, with commas)
        <input v-model="to" class="w-full rounded-lg border border-hairline bg-panel px-2.5 py-1.5 text-[13px] text-ink" placeholder="qa@acme.example">
      </label>
      <div class="flex basis-full flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
        <label v-for="[key, words] in eventList" :key="key" class="flex items-center gap-1.5">
          <input type="checkbox" :checked="events.includes(key)" class="size-3.5 accent-brand" @change="toggleEvent(key)"> {{ words }}
        </label>
        <Btn type="submit" size="sm" class="ml-auto" :disabled="adding || (kind === 'email' ? !to : !url) || !events.length">{{ adding ? 'Adding…' : 'Add' }}</Btn>
      </div>
      <p v-if="addError" class="basis-full text-[11.5px] text-critical">{{ addError }}</p>
      <p v-else-if="kind === 'email' && !state.smtp" class="basis-full text-[11.5px] text-ink-3">Email needs a relay on the runner: GC_SMTP_URL and GC_SMTP_FROM.</p>
    </form>
  </section>
</template>
