<script setup>
/**
 * The two things that are deliberately not editable by a script: which origins
 * may be driven, and which vault keys exist. Values never appear — the server
 * only ever hands over names.
 *
 * Allowing an origin is the step-up action (docs/AUTH.md §9): the runner
 * wants a token whose `su` is still in the future, which the control plane
 * grants only for a recent proof of the strongest factor the account has.
 * A 403 step_up_required opens the reauthentication sheet; the proof
 * forgets the token, the retry mints a fresh one, and the origin goes in.
 *
 * Both lists are the organisation's own (docs/AUTH.md §10): the origins
 * arrive with the socket's greeting, the vault's key names only from
 * /api/state under the token — never from the greeting. A 402 is the plan
 * saying the list is full, drawn as an upgrade prompt; a 403 forbidden is
 * a member asking for an owner's or admin's change.
 */
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';
import { useGuarded } from '@/composables/reauth';
import { LABEL } from '@/theme';
import TopBar from '@/components/TopBar.vue';
import Field from '@/components/Field.vue';
import ReauthSheet from '@/components/ReauthSheet.vue';
import UpgradePrompt from '@/components/UpgradePrompt.vue';
import ThemeSwitch from '@/components/ThemeSwitch.vue';
import NotifyPanel from '@/components/NotifyPanel.vue';

const live = useLive();
const session = useSession();
const ui = useUi();
const guard = useGuarded();

/** How this browser draws the app, in the words the switch uses. */
const themeChoice = computed(() => (ui.theme === 'system'
  ? `Following this device, which is ${ui.dark ? 'dark' : 'light'} now.`
  : `Always ${LABEL[ui.theme].toLowerCase()}, whatever this device prefers.`));
const draft = ref('');
const error = ref(null);
const upgrade = ref(null);
const state = ref(null);

const refresh = async () => { state.value = await api.state(); live.secrets = state.value.secrets ?? []; };

/**
 * Showing pages to a model: two consents the organisation gives, each off
 * until an owner or admin says otherwise (server.js healStateFor). The
 * deployment can offer a model — a key, GC_HEAL=ai, the chat on a model —
 * but cannot decide for the organisation; `available` says whether the offer
 * stands and `reason` why not. An older runner has no such route: no panel.
 */
const heal = ref(null);
const healError = ref(null);
const loadHeal = async () => { try { heal.value = await api.healSettings(); } catch { heal.value = null; } };
const because = (reason) => ({
  deployment: 'the deployment does not offer a model for fixes (GC_HEAL)',
  switch: 'switched off by the operator',
  key: 'the runner has no model to show it to',
  organisation: null,
}[reason] ?? null);
async function consent(key, on) {
  healError.value = null;
  try { heal.value = await api.setHealSettings({ [key]: on }); }
  catch (e) {
    healError.value = e.switchedOff ? `${e.switchedOff} is turned off on this deployment` : e.message;
    await loadHeal();
  }
}
onMounted(() => { refresh(); loadHeal(); });

/** Allow the drafted origin; say which proof the runner wants when it says step-up. */
async function allow() {
  const origin = draft.value;
  try {
    const r = await api.allowOrigin(origin);
    live.origins = r.origins;
    draft.value = '';
    return 'ok';
  } catch (e) {
    if (e.stepUp) {
      session.forgetToken();
      // The runner's step-up refusal names no proof, so this is a guess from
      // what the session last heard. Refreshed first, because enrolling in
      // another tab makes the cached answer wrong — and the sheet can still
      // switch if the control plane disagrees (composables/reauth.js).
      await session.refresh();
      return session.mfa.enrolled ? 'mfa_reauthenticate' : 'reauthenticate';
    }
    if (e.entitlement) { upgrade.value = e.entitlement; return 'error'; }
    error.value = e.message;
    return 'error';
  }
}

async function add() {
  error.value = null;
  upgrade.value = null;
  await guard.run(allow);
}

async function proved() {
  error.value = null;
  await guard.proved();
}
async function remove(o) {
  error.value = null;
  try { const r = await api.removeOrigin(o); live.origins = r.origins; }
  catch (e) { error.value = e.message; }
}
</script>

<template>
  <TopBar :crumbs="[{ label: 'Origins & vault' }]" />

  <div class="mx-auto max-w-3xl px-6 py-8">
    <h1 class="display mb-1 text-3xl">Origins &amp; vault</h1>
    <p class="mb-6 max-w-2xl text-[14px] leading-relaxed text-ink-2">
      The two decisions only a person makes. A generated plan cannot reach either of them.
    </p>

    <p v-if="error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ error }}</p>
    <UpgradePrompt v-if="upgrade" class="mb-4" :limit="upgrade.limit" :plan="upgrade.plan" @dismiss="upgrade = null" />

    <section class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">Allowed origins</h2>
      <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
        Every <code>goto</code> is checked against this list. A wildcard still refuses the private
        network by name, so allowing everything does not hand out the metadata endpoint.
      </p>
      <ul class="mt-4 flex flex-wrap gap-1.5">
        <li v-for="o in live.origins" :key="o"
            class="flex items-center gap-2 rounded-full border border-hairline px-3 py-1.5 font-mono text-[12px]">
          {{ o }}
          <button v-if="session.manages" class="text-ink-3 hover:text-critical" :title="`Remove ${o}`" @click="remove(o)">✕</button>
        </li>
      </ul>
      <p v-if="state?.usage?.origins?.max != null" class="mt-2 text-[12.5px] text-ink-3">
        {{ state.usage.origins.used }} of {{ state.usage.origins.max }} on the {{ state.plan }} plan.
      </p>
      <p v-if="!session.manages" class="mt-3 text-[12.5px] text-ink-3">Only an owner or admin of the organisation changes this list.</p>
      <div v-else class="mt-4 flex items-end gap-2">
        <Field label="Allow another" class="flex-1">
          <input v-model="draft" placeholder="staging.acme.com" spellcheck="false" @keyup.enter="add">
        </Field>
        <button class="mb-0.5 rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-deep disabled:bg-ink/[0.05] disabled:text-ink-3"
                :disabled="!draft" @click="add">Allow</button>
      </div>
    </section>

    <section class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">Vault keys</h2>
      <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
        Names only. A value is read on the server at the moment a field is filled and never travels
        to this page, the log, a script, or a diagram.
      </p>
      <ul class="mt-4 flex flex-wrap gap-1.5">
        <li v-for="s in live.secrets" :key="s"
            class="rounded-full border border-hairline px-3 py-1.5 font-mono text-[12px]">${{ s }}</li>
        <li v-if="!live.secrets.length" class="text-[13px] text-ink-3">None set.</li>
      </ul>
      <p v-if="state && !state.usage?.vault" class="mt-3 text-[12.5px] text-warn">
        The {{ state.plan ?? 'current' }} plan does not include the vault: a <code>$KEY</code> in a step will not resolve.
      </p>
      <p class="mt-3 text-[12.5px] text-ink-3">
        Set in <code>.ghostclick/{{ state?.org ?? 'local' }}/secrets.json</code> on the runner<template v-if="!session.required">, or with <code>GC_SECRET_NAME=value</code></template>.
      </p>
    </section>

    <!-- Where the runner tells somebody when nobody has a page open (notify.js). -->
    <NotifyPanel />

    <!-- The one setting that is the person's, not the organisation's: how this
         browser draws the app. Remembered here, never on the server. -->
    <section class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">Appearance</h2>
      <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
        Light, dark, or whatever this device prefers. Remembered by this browser, not by the
        account, so a shared runner never changes it for anyone else.
      </p>
      <div class="mt-4 max-w-xs">
        <ThemeSwitch />
      </div>
      <p class="mt-3 text-[12.5px] text-ink-3">{{ themeChoice }}</p>
    </section>

    <!-- Two decisions about the organisation's own pages: whether a model may
         read them to fix a step, and whether it may read them to draft tests. -->
    <section v-if="heal" class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">Showing pages to a model</h2>
      <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
        Each is off until an owner or admin says otherwise. The deployment can offer a model; it
        cannot decide for you. A page shown to a model goes with its typed values stripped and its
        vault values redacted, inside a block the model is told is evidence, never instructions.
      </p>
      <div class="mt-4 space-y-3 text-[13px]">
        <label class="flex items-start gap-3">
          <input type="checkbox" class="mt-1" :checked="heal.ai?.enabled" :disabled="!session.manages" @change="consent('ai', $event.target.checked)">
          <span>
            <span class="font-medium">Fix broken steps</span> — when a recorded step fails, a model may read the page it
            failed on and pick one move from a fixed menu; a fix to a saved case still waits for a person.
            <span v-if="heal.ai && !heal.ai.available && because(heal.ai.reason)" class="block text-[12px] text-ink-3">Not on offer here: {{ because(heal.ai.reason) }}.</span>
          </span>
        </label>
        <label class="flex items-start gap-3">
          <input type="checkbox" class="mt-1" :checked="heal.plan?.enabled" :disabled="!session.manages" @change="consent('plan', $event.target.checked)">
          <span>
            <span class="font-medium">Draft test cases</span> — from the chat, a model may read a page and write cases for
            you to tick, run and keep. Without this the runner still drafts them by rules, from what it already holds.
            <span v-if="heal.plan && !heal.plan.available && because(heal.plan.reason)" class="block text-[12px] text-ink-3">Not on offer here: {{ because(heal.plan.reason) }}.</span>
          </span>
        </label>
      </div>
      <p v-if="!session.manages" class="mt-3 text-[12.5px] text-ink-3">Only an owner or admin of the organisation changes these.</p>
      <p v-if="healError" class="mt-3 rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">{{ healError }}</p>
    </section>

    <section v-if="state" class="card p-5">
      <h2 class="text-[15px] font-medium">Runner</h2>
      <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
        <dt class="text-ink-3">Browser</dt>
        <dd>{{ state.headed ? 'Headed — a real window' : 'Headless — streamed to the console' }}</dd>
        <dt class="text-ink-3">Current page</dt>
        <dd class="truncate font-mono text-[12px]">{{ state.url ?? (state.driving?.org && !state.driving.mine ? `another organisation’s (${state.driving.org})` : 'nothing open') }}</dd>
        <dt class="text-ink-3">Organisation</dt>
        <dd class="font-mono text-[12px]">{{ state.org }}<template v-if="state.plan"> · {{ state.plan }} plan</template></dd>
      </dl>
    </section>
  </div>

  <ReauthSheet v-if="guard.flow.value" :flow="guard.flow.value" @done="proved" @switch="guard.switched" @cancel="guard.cancel()" />
</template>
