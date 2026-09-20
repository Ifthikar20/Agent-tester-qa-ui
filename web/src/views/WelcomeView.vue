<script setup>
/**
 * The first run: naming the workspace, and pointing it at something.
 *
 * A workspace is the top of everything here — it owns the projects, the runs,
 * the defects, the monitors, the origin allowlist and the vault (workspace.js)
 * — and what it did not have was a NAME. Every screen printed the literal
 * words "Local workspace" instead, which is a hard-coded answer to a question
 * that has a real one, and it made every installation look like the same
 * anonymous box. This is where the question gets asked, once, before the app
 * opens.
 *
 * It is the whole screen rather than a panel inside the app because the guard
 * shows it INSTEAD of the app: a sidebar whose workspace row reads "Name this
 * workspace" framing the page that names it would be the product arguing with
 * itself. The router does not wrap this view, so there is no TopBar and no
 * SideNav to hide.
 *
 * Two steps, and only the first one counts. The name is what the guard waits
 * for, so step 2 — the first site to test — is genuinely optional and says so.
 * A first-run flow that will not let you in until you have handed it a URL is
 * a first-run flow people close, and skipping costs nothing: the same field is
 * the first thing on the projects page.
 *
 * There is no Back. By the time step 2 is on screen step 1 has already written
 * the name, so Back could only offer to rename something named thirty seconds
 * ago — and renaming belongs on the settings page, where it can be done at
 * leisure rather than in the middle of getting started.
 *
 * What step 1 writes is the runner's own copy of the name. Where a control
 * plane is configured the organisation's name wins wherever this is drawn
 * (SideNav), and the copy is a harmless preference; on a laptop with no
 * control plane it is the whole answer, and `owner` is who set it up in their
 * own words rather than an account, because there are no accounts to point at.
 */
import { nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { useSuites } from '@/stores/suites';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';

const router = useRouter();
const live = useLive();
const suites = useSuites();

const step = ref(1);
const busy = ref(false);
const error = ref(null);
/** The origin the runner refused, when a refusal is why the quickstart failed. */
const needsOrigin = ref(null);

const yourName = ref('');
const workspaceName = ref('');
const url = ref('');

const nameBox = ref(null);
const urlBox = ref(null);
onMounted(() => nextTick(() => nameBox.value?.focus()));

/**
 * Most people name a workspace after themselves, so typing your name fills the
 * second field in — and the moment anybody touches that field it stops, for
 * good. Clearing it counts as touching it: a name that springs back while you
 * are deleting it is what gets reported as the field being broken, and "they
 * emptied it on purpose" is a likelier reading than "they want mine again".
 */
const chosen = ref(false);
watch(yourName, (typed) => {
  if (chosen.value) return;
  const who = typed.trim();
  workspaceName.value = who ? `${who}'s workspace` : '';
});

/**
 * Name it, and let the app open.
 *
 * `setWorkspace` answers with the workspace as the runner now describes it, and
 * that answer is put straight into the live store because nothing else will:
 * the greeting is what normally carries it (live.js) and the PATCH does not
 * emit one. Without this line the sidebar would go on offering to name a
 * workspace that has just been named, and the guard would send the next
 * navigation straight back to this screen.
 */
async function createWorkspace() {
  const name = workspaceName.value.trim();
  if (!name || busy.value) return;
  busy.value = true; error.value = null;
  try {
    const r = await api.setWorkspace({ name, owner: yourName.value.trim() });
    live.workspace = r.workspace;
    /**
     * Step 2 is for a workspace with nothing in it, and this is not always
     * one.
     *
     * The commonest way to arrive here is an install that has been in use for
     * weeks: the workspace has projects and simply never had a name, because
     * until now there was nowhere to put one. Asking that person for "the
     * first site to test" when three are already in the sidebar is the product
     * failing to look at what it already has. So the projects are counted
     * before the question is asked, and if there are any, naming it was the
     * whole errand and they go straight in.
     */
    await suites.loadList().catch(() => null);
    if (suites.list.length) { router.replace('/chat'); return; }
    step.value = 2;
    await nextTick();
    urlBox.value?.focus();
  } catch (e) {
    error.value = e.message;
  } finally { busy.value = false; }
}

/**
 * One paste, one project, one test that has actually run.
 *
 * This holds the browser for a few seconds — it opens the address, reads what
 * is on the page, makes the project and runs its first check — which is why
 * the button says what it is doing rather than spinning silently.
 */
async function quickstart() {
  const address = url.value.trim();
  if (!address || busy.value) return;
  busy.value = true; error.value = null; needsOrigin.value = null;
  try {
    const { suite } = await api.quickstart(address);
    // The sidebar's project list was loaded before this existed.
    await suites.loadList().catch(() => null);
    // replace, not push: the workspace has a name now, so Back would be back to
    // a screen the guard has stopped showing.
    router.replace({ name: 'suite', params: { id: suite.id } });
  } catch (e) {
    // The runner's own sentence. It knows that an address is not a URL, that
    // the plan is spent, that another organisation has the browser and that an
    // origin was never approved — and rewording any of those here would only
    // make the screen wrong in a new way the next time the runner learns
    // something. `needsOrigin` gets a line of its own below because it is the
    // one refusal a person cannot act on from this page.
    error.value = e.message;
    needsOrigin.value = e.needsOrigin ?? null;
  } finally { busy.value = false; }
}

/** Into the app with no project. The prompt is the front door, and asks the same question. */
const skip = () => router.replace({ name: 'chat' });
</script>

<template>
  <!-- AuthShell is the frame the account pages share and says so; this is not
       one of them, and stretching it to carry a two-step flow with its own
       progress would change every sign-in screen to serve one page. The frame
       is four classes, so it is cheaper to repeat than to generalise. -->
  <div class="grid min-h-dvh place-items-center px-6 py-12">
    <div class="w-full max-w-lg">
      <p class="eyebrow">ghostclick</p>

      <!-- 1 ------------------------------------------------------------ -->
      <form v-if="step === 1" class="card wash mt-3 p-7" @submit.prevent="createWorkspace">
        <h1 class="display text-3xl">Create your workspace.</h1>
        <p class="mt-3 text-[15px] leading-relaxed text-ink-2">
          A workspace is the top of everything here. The projects you test, the runs they produce and
          the defects those raise all live inside one, it can hold as many projects as you like, and
          anybody you invite is invited to the workspace rather than to a single project.
        </p>

        <div class="mt-6 grid gap-4">
          <!-- Both fields stop at 60 characters because the runner trims to 60
               (workspace.js NAME_MAX, OWNER_MAX). A field that silently drops
               what you typed at save is worse than one that would not take it. -->
          <Field label="Your name" hint="Who set this up. Not an account — just what the product should call you.">
            <input ref="nameBox" v-model="yourName" maxlength="60" autocomplete="name" placeholder="Ada Lovelace">
          </Field>
          <Field label="Workspace name" hint="Usually a team or a company. You can rename it later in Settings.">
            <input v-model="workspaceName" maxlength="60" placeholder="Ada's workspace" @input="chosen = true">
          </Field>
        </div>

        <div class="mt-6">
          <Btn type="submit" :busy="busy" busy-label="Creating…" :disabled="!workspaceName.trim()">Next</Btn>
        </div>
      </form>

      <!-- 2 ------------------------------------------------------------ -->
      <form v-else class="card wash-warm mt-3 p-7" @submit.prevent="quickstart">
        <h1 class="display text-3xl">What do you want to test?</h1>
        <p class="mt-3 text-[15px] leading-relaxed text-ink-2">
          Paste the address of something that has to keep working. It will be opened, read, and run
          against a first test that says you got there — which is the quickest way to find out
          whether this can drive your app at all, before you decide what else has to be true.
        </p>

        <div class="mt-6">
          <Field label="Address" hint="A bare host is fine — staging.acme.com becomes https://staging.acme.com">
            <input ref="urlBox" v-model="url" spellcheck="false" placeholder="staging.acme.com/dashboard">
          </Field>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-2">
          <Btn type="submit" :busy="busy" busy-label="Opening and testing…" :disabled="!url.trim()">
            Open it and test
          </Btn>
          <!-- Btn is a type="button" inside this form, so skipping cannot
               submit it by accident. -->
          <Btn variant="ghost" :disabled="busy" @click="skip">Skip for now</Btn>
        </div>
      </form>

      <p v-if="error" class="mt-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] leading-relaxed text-critical">
        {{ error }}
        <!-- An origin nobody approved is the one refusal this screen cannot
             fix: approving one is a deliberate act on the origins list, and
             offering it here would put a second decision on the screen whose
             whole job is the first. So it points at the way out that is
             already on the page. -->
        <span v-if="needsOrigin" class="mt-1.5 block">
          {{ needsOrigin }} has to be allowed before the runner will open it, which is done from
          Settings. Skip for now and add this project once it is through.
        </span>
      </p>

      <!-- Two steps is barely a journey, so it gets two dots and a count
           rather than a bar pretending there is distance to cover. -->
      <p class="mt-5 flex items-center justify-center gap-2 text-[12px] text-ink-3">
        <span class="size-1.5 rounded-full" :class="step === 1 ? 'bg-brand' : 'bg-hairline'" />
        <span class="size-1.5 rounded-full" :class="step === 2 ? 'bg-brand' : 'bg-hairline'" />
        {{ step }} of 2
      </p>
    </div>
  </div>
</template>
