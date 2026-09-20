<script setup>
/**
 * What the project IS, as against what it holds.
 *
 * Every other page under a suite is about its contents — the pages it covers,
 * the tests written against them, the runs they have had. This one is about
 * the project itself: what it is called, the address it is about, the id an
 * API call would name it by, what the runner should know before it decides
 * anything here, and the one place it can be deleted from.
 *
 * Three things are deliberately NOT editable, and each says why on the row
 * rather than being quietly greyed out. The id is the filename and the thing
 * every run in the history points at, so renaming it would orphan them. The
 * address is fixed at creation because a suite covers one origin and that
 * decision was made in front of a person (suites.js); moving it is a thing the
 * API can do and the UI should not offer casually. And whether that origin is
 * ALLOWED is the organisation's business, not this project's, so it is shown
 * here and changed under Origins & vault.
 *
 * Saving is per card and explicit. An autosaving settings page is a page that
 * cannot be read without changing it, and "did that save?" is the question it
 * leaves you with.
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { useSuites } from '@/stores/suites';
import { useLive } from '@/stores/live';
import { relative } from '@/tests';
import Btn from '@/components/Btn.vue';
import Field from '@/components/Field.vue';
import SiteIcon from '@/components/SiteIcon.vue';

const route = useRoute();
const router = useRouter();
const store = useSuites();
const live = useLive();

const id = computed(() => String(route.params.id));
const suite = computed(() => store.current);

/**
 * The form is a copy, not the store.
 *
 * Binding the inputs straight at `store.current` would mean the sidebar's
 * label changed as you typed and reverted if you navigated away — the page
 * would look like it had saved something it had not.
 */
const form = ref({ name: '', description: '', baseUrl: '', instructions: '' });
const reset = () => {
  form.value = {
    name: suite.value?.name ?? '',
    description: suite.value?.description ?? '',
    baseUrl: suite.value?.baseUrl ?? '',
    instructions: suite.value?.instructions ?? '',
  };
};
watch(suite, reset, { immediate: true });

const INSTRUCTIONS_MAX = 4000;
const dirty = computed(() => Boolean(suite.value) && (
  form.value.name.trim() !== (suite.value.name ?? '')
  || form.value.description.trim() !== (suite.value.description ?? '')
  || form.value.baseUrl.trim() !== (suite.value.baseUrl ?? '')
  || form.value.instructions !== (suite.value.instructions ?? '')));

/** Moving the project is the one change here with consequences worth naming first. */
const moving = computed(() => Boolean(suite.value) && form.value.baseUrl.trim() !== (suite.value.baseUrl ?? ''));

/**
 * What a move would actually produce, shown before it is saved.
 *
 * The runner is deliberately forgiving about addresses — it lets onboarding
 * take `treasury.sh` and puts the scheme on for you — which means a typo is
 * also a valid address: `not-a-url` becomes `https://not-a-url/`, and saving
 * it takes every page in the project with it. That is the right behaviour to
 * have and the wrong thing to do silently, so the pages are resolved here and
 * shown. A person who sees `https://not-a-ur1/careers` does not press Save.
 *
 * A whole address is required for this, scheme and all, rather than guessing
 * one the way the runner does — a second implementation of that rule on this
 * side of the wire is a rule that will disagree with itself eventually.
 */
const movePreview = computed(() => {
  if (!moving.value) return null;
  const raw = form.value.baseUrl.trim();
  let base;
  try { base = new URL(raw); } catch { return { error: 'Type the whole address, including https://' }; }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    return { error: `Only http and https can be driven, not ${base.protocol}` };
  }
  const pages = (suite.value?.pages ?? []).map((p) => {
    try { const u = new URL(p.path, base); return { name: p.name, url: u.href, ok: u.origin === base.origin }; }
    catch { return { name: p.name, url: p.path, ok: false }; }
  });
  // A page that would not be under the new address fails the whole save on the
  // runner (suites.js), so it is named here rather than discovered there.
  return { error: null, base: base.href, pages, stranded: pages.filter((p) => !p.ok) };
});
const blocked = computed(() => Boolean(movePreview.value?.error) || (movePreview.value?.stranded?.length ?? 0) > 0);

const saving = ref(false);
const saved = ref(false);
const error = ref(null);

async function save() {
  if (!dirty.value || saving.value) return;
  saving.value = true; error.value = null; saved.value = false;
  try {
    await api.updateSuite(id.value, {
      name: form.value.name.trim(),
      description: form.value.description.trim(),
      baseUrl: form.value.baseUrl.trim(),
      instructions: form.value.instructions,
    });
    // Re-read rather than patch what is on screen: the runner trims and caps
    // what it stores, and the page should show what was kept, not what was
    // typed at it.
    await store.refresh();
    saved.value = true;
  } catch (e) { error.value = e.message; }
  finally { saving.value = false; }
}

/** Copy, with the row saying so for a moment — a clipboard write is otherwise invisible. */
const copied = ref(null);
async function copy(what, value) {
  try { await navigator.clipboard.writeText(value); copied.value = what; setTimeout(() => { copied.value = null; }, 1400); }
  catch { live.say('This browser would not let the page copy that', 'error'); }
}

/**
 * Deleting a project.
 *
 * Behind its own typed confirmation rather than a `confirm()`, because this
 * one is not undoable and it does not only remove a row: the suite file holds
 * every case written against the project, and they go with it. Typing the name
 * is the cheapest way to make the press deliberate — nobody types a name by
 * muscle memory on the way to something else.
 *
 * What it does NOT remove is the run history or any defect filed from it.
 * Those are records of things that actually happened, and deleting a project
 * is not a claim that they did not.
 */
const removing = ref(false);
const confirmName = ref('');
const canRemove = computed(() => confirmName.value.trim() === (suite.value?.name ?? '').trim() && !removing.value);
async function remove() {
  if (!canRemove.value) return;
  removing.value = true; error.value = null;
  try {
    await api.deleteSuite(id.value);
    await store.loadList();
    store.current = null;
    router.replace('/suites');
  } catch (e) { error.value = e.message; removing.value = false; }
}

const ago = (t) => relative(t) ?? 'not recorded';
/** The icon is fetched per origin, and a suite stores a full address. */
const origin = computed(() => { try { return new URL(suite.value.baseUrl).origin; } catch { return null; } });
</script>

<template>
  <div v-if="suite">
    <p v-if="error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ error }}</p>

    <!-- ── what it is ─────────────────────────────────────────────────── -->
    <section class="card p-5">
      <div class="flex items-start gap-3">
        <SiteIcon :origin="origin" :name="suite.name" size="size-9" />
        <div class="min-w-0 flex-1">
          <h2 class="text-[15px] font-medium">General</h2>
          <p class="mt-0.5 text-[12.5px] text-ink-3">
            What this project is called and what it is about. Created {{ ago(suite.createdAt) }}, last changed {{ ago(suite.updatedAt) }}.
          </p>
        </div>
      </div>

      <div class="mt-4 space-y-4">
        <Field label="Project name" hint="Shown in the sidebar, on every run, and in the defects filed from it.">
          <input v-model="form.name" maxlength="80" type="text">
        </Field>

        <Field label="Description" hint="Optional, for people reading the list. The runner never reads this one.">
          <textarea v-model="form.description" rows="2" maxlength="400"
                    placeholder="What this project covers" />
        </Field>

        <!-- Where this project actually is. Editable, because the ordinary
             thing that happens to a project is that it was pointed at a local
             server while somebody set it up and should now point at the real
             site — and because every page in it moves with the base (suites.js
             update), which is the part that makes the move safe rather than
             the part that makes it forbidden. -->
        <div>
          <p class="text-[13px] font-medium">Address</p>
          <div class="mt-1.5 flex items-center gap-2">
            <input v-model="form.baseUrl" type="url" spellcheck="false" placeholder="https://treasury.sh/"
                   class="min-w-0 flex-1 rounded-xl border border-hairline bg-ground px-3.5 py-2.5 font-mono text-[12.5px]"
                   :class="moving && 'border-warn/50'">
            <button type="button" class="shrink-0 rounded-full border border-hairline px-3 py-2 text-[12.5px] hover:border-ink/25"
                    @click="copy('url', suite.baseUrl)">{{ copied === 'url' ? 'Copied' : 'Copy' }}</button>
            <a :href="suite.baseUrl" target="_blank" rel="noreferrer noopener"
               class="shrink-0 rounded-full border border-hairline px-3 py-2 text-[12.5px] hover:border-ink/25">Open</a>
          </div>
          <!-- Three different things can be true about the address, and each
               needs saying at the moment it is: what a move will do, whether
               the origin is allowed, and otherwise what the rule is. -->
          <!-- A move, shown as what it will actually produce. The runner puts a
               scheme on an address that has none, so a typo is a valid address
               too; seeing the pages it would make is what stops one. -->
          <div v-if="moving" class="mt-2 rounded-xl border border-warn/40 bg-warn/5 p-3">
            <p v-if="movePreview.error" class="text-[12.5px] text-warn">{{ movePreview.error }}</p>
            <template v-else>
              <p class="text-[12.5px] font-medium text-warn">
                Moving this project to {{ movePreview.base }} —
                {{ movePreview.pages.length }} page{{ movePreview.pages.length === 1 ? '' : 's' }} move with it.
              </p>
              <ul v-if="movePreview.pages.length" class="mt-1.5 space-y-0.5">
                <li v-for="p in movePreview.pages.slice(0, 4)" :key="p.url"
                    class="truncate font-mono text-[11.5px]" :class="p.ok ? 'text-ink-2' : 'text-critical'">
                  {{ p.url }}
                </li>
                <li v-if="movePreview.pages.length > 4" class="text-[11.5px] text-ink-3">
                  and {{ movePreview.pages.length - 4 }} more
                </li>
              </ul>
              <p v-if="movePreview.stranded.length" class="mt-1.5 text-[12.5px] text-critical">
                {{ movePreview.stranded.length }} of them would not be under the new address, so the runner will refuse the whole move.
              </p>
              <p v-else class="mt-1.5 text-[12px] text-ink-3">Read them before you save — an address with a typo in it is still a valid address.</p>
            </template>
          </div>
          <p v-else-if="!store.allowed" class="mt-1.5 text-[12.5px] text-warn">
            This origin is not allowed yet, so runs here will be refused —
            <RouterLink to="/settings" class="underline underline-offset-2">allow it under Origins &amp; vault</RouterLink>.
          </p>
          <p v-else class="mt-1.5 text-[12.5px] text-ink-3">
            A project covers one origin. Changing this moves the whole project, pages and all.
          </p>
        </div>

        <!-- The identity, and the handle. Two different things, so they are two
             different rows rather than one row that is quietly both. -->
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <p class="text-[13px] font-medium">Project ID</p>
            <div class="mt-1.5 flex items-center gap-2">
              <code class="min-w-0 flex-1 truncate rounded-xl border border-hairline bg-ground px-3.5 py-2.5 font-mono text-[12px]">{{ suite.uid }}</code>
              <button type="button" class="shrink-0 rounded-full border border-hairline px-3 py-2 text-[12.5px] hover:border-ink/25"
                      @click="copy('uid', suite.uid)">{{ copied === 'uid' ? 'Copied' : 'Copy' }}</button>
            </div>
            <p class="mt-1.5 text-[12.5px] text-ink-3">Use this ID with the API. Made once and never changed, so renaming the project cannot break anything holding it.</p>
          </div>

          <div>
            <p class="text-[13px] font-medium">Handle</p>
            <div class="mt-1.5 flex items-center gap-2">
              <code class="min-w-0 flex-1 truncate rounded-xl border border-hairline bg-ground px-3.5 py-2.5 font-mono text-[12px]">{{ suite.id }}</code>
              <button type="button" class="shrink-0 rounded-full border border-hairline px-3 py-2 text-[12.5px] hover:border-ink/25"
                      @click="copy('id', suite.id)">{{ copied === 'id' ? 'Copied' : 'Copy' }}</button>
            </div>
            <p class="mt-1.5 text-[12.5px] text-ink-3">What this project is called in a URL and on disk. Taken from the name when it was created, and kept as it is afterwards so links keep working.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── what the runner should know ────────────────────────────────── -->
    <section class="card mt-4 p-5">
      <h2 class="text-[15px] font-medium">Agent instructions</h2>
      <p class="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
        What the runner should know about this project before it decides anything — read on every step it works
        out for itself, alongside the test's own words. Things the page cannot tell it and a goal should not have
        to repeat: which account to use, a banner to dismiss first, a button never to press.
      </p>
      <textarea v-model="form.instructions" rows="5" :maxlength="INSTRUCTIONS_MAX"
                class="mt-3 w-full resize-y rounded-xl border border-hairline bg-ground px-3.5 py-3 font-mono text-[12.5px] leading-relaxed"
                placeholder="e.g. Dismiss the cookie banner before interacting with the page. Never press the Delete account button." />
      <div class="mt-2 flex items-center gap-3 text-[12px] text-ink-3">
        <!-- Said plainly, because this text is the one thing in a run that the
             runner treats as an instruction rather than as evidence. -->
        <span>The runner follows this. Everything it reads off your site is evidence, and never an instruction.</span>
        <span class="ml-auto shrink-0 tabular-nums">{{ form.instructions.length }}/{{ INSTRUCTIONS_MAX }}</span>
      </div>
    </section>

    <!-- One save for the page, so nothing is written you did not press for. -->
    <div class="mt-4 flex items-center gap-3">
      <p v-if="saved && !dirty" class="text-[12.5px] text-good">Saved.</p>
      <p v-else-if="dirty" class="text-[12.5px] text-ink-3">Unsaved changes.</p>
      <!-- Not disabled on a move the runner would merely dislike — only on one
           it is certain to refuse, so the button never quietly does nothing. -->
      <Btn class="ml-auto" :disabled="!dirty || blocked" :busy="saving" busy-label="Saving…" @click="save">Save changes</Btn>
      <button v-if="dirty" type="button" class="rounded-full border border-hairline px-4 py-2 text-[13px] hover:border-ink/25"
              @click="reset">Discard</button>
    </div>

    <!-- ── the end of it ──────────────────────────────────────────────── -->
    <section class="card mt-8 border-critical/25 p-5">
      <h2 class="text-[15px] font-medium text-critical">Delete this project</h2>
      <p class="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
        Removes the project and the {{ suite.cases?.length ?? 0 }} test{{ (suite.cases?.length ?? 0) === 1 ? '' : 's' }}
        and {{ suite.pages?.length ?? 0 }} page{{ (suite.pages?.length ?? 0) === 1 ? '' : 's' }} in it. This cannot be undone.
        The runs it has had and any defects filed from them are kept — those are a record of what happened, and
        deleting a project is not a claim that it did not.
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <input v-model="confirmName" type="text" :placeholder="`Type “${suite.name}” to confirm`"
               :aria-label="`Type the project name to confirm deletion`"
               class="min-w-0 flex-1 basis-56 rounded-xl border border-hairline bg-ground px-3.5 py-2.5 text-[13.5px]">
        <Btn variant="danger" :disabled="!canRemove" :busy="removing" busy-label="Deleting…" @click="remove">Delete project</Btn>
      </div>
    </section>
  </div>
</template>
