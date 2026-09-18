<script setup>
/**
 * The sidebar is the product's table of contents: workspace at the top, the
 * suites you have onboarded in the middle, and the things that are not
 * suite-specific below. The open suite expands into its own sections, so
 * "where am I" is answered by the nav rather than by the breadcrumb alone.
 *
 * White, not a dark slab. A navy sidebar is a decade-old convention that puts
 * the heaviest block of colour on the part of the screen carrying the least
 * information — it draws the eye away from the run you are actually watching.
 * A hairline does the separating instead, the accent marks only what is
 * selected, and the icons are line art so a column of them reads as texture
 * rather than as twelve competing badges.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSuites } from '@/stores/suites';
import { useLive } from '@/stores/live';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';
import { useChatStore } from '@/stores/chat';
import { when } from '@/time';
import SiteIcon from '@/components/SiteIcon.vue';
// The nav's glyphs are named rather than drawn here: src/icons resolves each
// name to the designer's PNG if one has been dropped in and to line art if not,
// so redrawing this sidebar is a file, not an edit. See src/icons/README.md.
import Icon from '@/components/Icon.vue';

const route = useRoute();
const router = useRouter();
const suites = useSuites();
const live = useLive();
const session = useSession();
const ui = useUi();
const chat = useChatStore();

/**
 * Collapsed is a 64px RAIL, not zero width.
 *
 * Collapsing to nothing means the only way back is a control that has to live
 * somewhere else — a floating button over the content, or a hamburger in the
 * header — and then the shell has two nav affordances that must agree. A rail
 * keeps the toggle where the sidebar already is, and keeps the icons, which are
 * most of what you navigate by once you know the product.
 */
const rail = computed(() => ui.navCollapsed);

async function signOut() {
  await session.logout();
  router.replace({ name: 'login' });
}

/**
 * Which organisation this session acts for. The control plane checks the
 * membership and remembers the choice; the socket and the token are dropped
 * so the next of each is the new organisation's, and the suites in this
 * sidebar are re-read from its directory.
 */
const switching = ref(false);
async function switchOrg(slug) {
  if (!slug || slug === session.org?.slug) return;
  switching.value = true;
  try {
    await session.switchOrg(slug);
    await suites.loadList();
    router.replace('/suites');
  } catch (e) { live.say(e.message, 'error'); }
  finally { switching.value = false; }
}
/**
 * The runner's state, once, because the rail and the expanded row both draw it
 * and a second copy of this ternary is how they end up disagreeing.
 */
const runnerState = computed(() => (live.busy ? `Runner busy — ${live.driving.org}`
  : live.connected ? 'Runner connected' : 'Runner offline'));
const runnerDot = computed(() => (live.busy ? 'bg-warn' : live.connected ? 'bg-good' : 'bg-critical'));

const initial = computed(() => (session.org?.name ?? 'Local').slice(0, 1).toUpperCase());

// The suite a page is about: its own pages carry the id in the path; the
// console and monitoring opened on a suite carry it as ?suite=.
const openId = computed(() => route.params.id ?? (route.query.suite ? String(route.query.suite) : null));

onMounted(() => {
  // The open-incident dot has to be right before the monitoring page has been
  // visited, so the sidebar asks for the one thing only it draws.
  live.loadOpenIncidents();
  // And the recent chats, which it draws on every page.
  if (chat.available === null) chat.load({ quiet: true }).catch(() => {});
});

/**
 * The recent chats under Chat: newest first, the search over title and last
 * words once there are enough to need one, eight until asked for all. A
 * conversation is about whatever you are looking at, so the list is here on
 * every page rather than on the chat page alone.
 */
const CHATS_SHOWN = 8;
const chatQuery = ref('');
const showAllChats = ref(false);
const chatRows = computed(() => {
  const q = chatQuery.value.trim().toLowerCase();
  const rows = [...chat.conversations].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return q ? rows.filter((c) => `${c.title ?? ''}\n${c.last?.text ?? ''}`.toLowerCase().includes(q)) : rows;
});
const chatsShown = computed(() => (showAllChats.value || chatQuery.value ? chatRows.value : chatRows.value.slice(0, CHATS_SHOWN)));
const chatsMore = computed(() => !chatQuery.value && chatRows.value.length > CHATS_SHOWN);
const onChatPage = computed(() => route.name === 'chat');
function openChat(id) {
  chat.open(id);
  if (!onChatPage.value) router.push('/chat');
}
function newChat() {
  chat.fresh();
  if (!onChatPage.value) router.push('/chat');
}
async function removeChat(id) {
  const c = chat.conversations.find((x) => x.id === id);
  if (!c) return;
  if (!confirm(`Delete "${c.title}"? The runner forgets it too.`)) return;
  await chat.remove(id);
}

const SECTIONS = [
  { to: 'suite',       label: 'Overview' },
  { to: 'suite-pages', label: 'Pages' },
  { to: 'suite-cases', label: 'Cases' },
  { to: 'suite-runs',  label: 'Runs' },
  // Monitoring is one page for every project, told which one by ?suite=.
  { to: 'monitoring',  label: 'Monitoring', query: true },
];
const sectionLink = (x, s) => (x.query ? { name: x.to, query: { suite: s.id } } : { name: x.to, params: { id: s.id } });
const sectionOn = (x, s) => (x.query ? route.name === x.to && route.query.suite === s.id : route.name === x.to);
</script>

<template>
  <!-- Width is the only thing that changes, because App.vue's shell is plain
       flexbox: main is flex-1 and reflows on its own. Transitioning the width
       rather than toggling it stops the content from jumping. -->
  <aside class="flex shrink-0 flex-col border-r border-hairline bg-panel transition-[width] duration-200"
         :class="rail ? 'w-16' : 'w-[248px]'">
    <!-- The mark, doubling as the toggle. A product signs its own corner, and
         the corner is also the most findable place to put the control that put
         it there — no floating button, no second affordance to keep in sync. -->
    <button type="button" @click="ui.toggleNav()"
            :title="rail ? 'Expand the sidebar' : 'Collapse the sidebar'"
            :aria-label="rail ? 'Expand the sidebar' : 'Collapse the sidebar'"
            :aria-expanded="!rail"
            class="group flex items-center gap-2.5 py-4 hover:bg-ink/[0.03]"
            :class="rail ? 'justify-center px-0' : 'px-4'">
      <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-ink">
        <span class="size-2 rounded-full bg-brand" />
      </span>
      <span v-if="!rail" class="text-[15px] font-semibold tracking-tight text-ink">ghost<span class="text-brand">click</span></span>
      <svg v-if="!rail" viewBox="0 0 16 16" class="ml-auto size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
           fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9.5 4.5 6 8l3.5 3.5" />
      </svg>
    </button>

    <!-- The collapse control, at the top where a hand goes looking for it.
         The mark above toggles too; both call the same action, so there is
         nothing to keep in sync. -->
    <button type="button" @click="ui.toggleNav()"
            :title="rail ? 'Expand the sidebar' : 'Collapse the sidebar'"
            :aria-label="rail ? 'Expand the sidebar' : 'Collapse the sidebar'"
            :aria-expanded="!rail"
            class="nav-item mb-3 hover:bg-ink/[0.04] hover:text-ink"
            :class="rail ? 'nav-item-rail mx-2' : 'mx-3'">
      <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2.5 3h11v10h-11zM6 3v10" />
        <path :d="rail ? 'M9 6.5 10.5 8 9 9.5' : 'M10.5 6.5 9 8l1.5 1.5'" />
      </svg>
      <span v-if="!rail">Collapse</span>
    </button>

    <!-- Workspace: the organisation you act for (docs/AUTH.md §10) — every
         suite, origin and run below is hers — with its plan, and whether the
         thing that does the work is actually up: a runner that has quietly
         died should not need a run to discover, and one another organisation
         is driving should say so here, not on the canvas.

         Collapsed to the rail there is nowhere to write any of that, so the
         name, the plan and the switcher go and the runner state becomes a dot
         on the avatar. Dropping it entirely would hide the one thing this
         block exists to surface, so the title carries the words for a pointer. -->
    <div class="mb-5 rounded-xl border border-hairline bg-ground"
         :class="rail ? 'mx-2 p-2' : 'mx-3 px-3 py-2.5'">
      <div class="flex items-center gap-2.5" :class="rail && 'justify-center'">
        <span class="relative grid size-7 shrink-0 place-items-center rounded-lg bg-panel text-[12px] font-semibold
                     text-ink-2 ring-1 ring-hairline"
              :title="rail ? `${session.org?.name ?? 'Local workspace'} — ${runnerState}` : session.org?.slug">{{ initial }}<span
              v-if="rail" class="absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-ground"
              :class="runnerDot" /></span>
        <span v-if="!rail" class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="block truncate text-[13px] font-medium text-ink" :title="session.org?.slug">{{ session.org?.name ?? 'Local workspace' }}</span>
            <span v-if="session.org?.plan" class="shrink-0 rounded-full bg-brand-50 px-1.5 py-px text-[10.5px] font-medium text-brand-2">{{ session.org.plan }}</span>
          </span>
          <span class="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <span class="size-1.5 rounded-full" :class="runnerDot" />
            {{ runnerState }}
          </span>
        </span>
      </div>
      <!-- A switcher only when there is something to switch to. -->
      <select v-if="!rail && session.orgs.length > 1" :value="session.org?.slug" :disabled="switching"
              aria-label="Act for another organisation"
              class="mt-2 w-full rounded-lg border border-hairline bg-panel px-2 py-1 text-[12px] text-ink-2 outline-none focus:border-ink/25"
              @change="switchOrg($event.target.value)">
        <option v-for="o in session.orgs" :key="o.slug" :value="o.slug">{{ o.name }} · {{ o.role }}</option>
      </select>
    </div>

    <nav class="flex-1 overflow-y-auto pb-4" :class="rail ? 'px-2' : 'px-3'">
      <div class="flex items-center pb-2" :class="rail ? 'justify-center' : 'justify-between px-2'">
        <span v-if="!rail" class="eyebrow">Test suites</span>
        <RouterLink to="/suites/new" title="Onboard a project" aria-label="Onboard a project"
                    class="grid size-5 place-items-center rounded-md text-[15px] leading-none text-ink-3
                           hover:bg-ink/[0.05] hover:text-ink">+</RouterLink>
      </div>

      <p v-if="suites.listed && !suites.list.length && !rail" class="px-2 py-1.5 text-[12.5px] text-ink-3">
        None yet — <RouterLink to="/suites/new" class="text-brand-2 underline underline-offset-2">onboard one</RouterLink>.
      </p>

      <template v-for="s in suites.list" :key="s.id">
        <!-- The site's own mark, not a glyph every suite shares. `title` and
             `aria-label` are on the link rather than the image because in the
             rail the visible label is gone, and the name has to survive that
             for a hover and for a screen reader alike. -->
        <RouterLink :to="`/suites/${s.id}`" class="nav-item hover:bg-ink/[0.04] hover:text-ink"
                    :class="[openId === s.id && 'nav-item-on', rail && 'nav-item-rail']"
                    :title="rail ? `${s.name} — ${s.cases} case${s.cases === 1 ? '' : 's'}` : null"
                    :aria-label="rail ? s.name : null">
          <SiteIcon :origin="s.origin" :name="s.name" :size="rail ? 'size-5' : 'size-4'" />
          <span v-if="!rail" class="truncate">{{ s.name }}</span>
          <span v-if="!rail" class="ml-auto shrink-0 text-[11px] tabular-nums text-ink-3">{{ s.cases }}</span>
        </RouterLink>

        <!-- The open suite's own sections, hung off it so the nav answers
             "where am I" without the breadcrumb having to. -->
        <!-- Bound by name rather than by active-class: `text-ink-3` and
             `text-brand-2` are both plain text utilities, so which one wins is
             decided by stylesheet order, not by the order they are written
             here — the selected section came out grey. -->
        <!-- A line runs down from the suite's mark and the section names line
             up with the suite's name, so the four read as its children rather
             than as four more suites set a little to the right. The open one
             colours its stretch of the line instead of wearing a second pill
             under the suite's own. -->
        <div v-if="openId === s.id && !rail" class="mb-1.5 ml-[1.05rem] mt-0.5 border-l border-hairline pl-[7px]">
          <RouterLink v-for="x in SECTIONS" :key="x.to" :to="sectionLink(x, s)"
            class="relative block rounded-md px-2.5 py-1.5 text-[12.5px] leading-5
                   before:absolute before:bottom-1.5 before:top-1.5 before:w-0.5 before:rounded-full
                   before:left-[-8.3px] before:content-['']"
            :class="sectionOn(x, s)
              ? 'font-medium text-brand-2 before:bg-brand'
              : 'text-ink-3 before:bg-transparent hover:bg-ink/[0.04] hover:text-ink'">
            {{ x.label }}
          </RouterLink>
        </div>
      </template>

      <p v-if="!rail" class="eyebrow px-2 pb-2 pt-6">General</p>
      <div v-else class="mx-2 mt-6 mb-2 border-t border-hairline" />
      <RouterLink to="/dashboard" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on"
                  :class="rail && 'nav-item-rail'" :title="rail ? 'Run history' : null" :aria-label="rail ? 'Run history' : null">
        <Icon name="history" class="size-4 shrink-0" />
        <span v-if="!rail">Run history</span>
      </RouterLink>
      <RouterLink to="/defects" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on"
                  :class="rail && 'nav-item-rail'" :title="rail ? 'Defects' : null" :aria-label="rail ? 'Defects' : null">
        <Icon name="defects" class="size-4 shrink-0" />
        <span v-if="!rail">Defects</span>
      </RouterLink>
      <RouterLink to="/console" class="nav-item relative hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on"
                  :class="rail && 'nav-item-rail'" :title="rail ? 'Console' : null" :aria-label="rail ? 'Console' : null">
        <Icon name="console" class="size-4 shrink-0" />
        <span v-if="!rail">Console</span>
        <span v-if="live.recording" :class="rail ? 'absolute right-1 top-1 size-1.5' : 'ml-auto size-1.5'" class="animate-pulse rounded-full bg-critical" title="recording" />
        <span v-else-if="live.running" :class="rail ? 'absolute right-1 top-1 size-1.5' : 'ml-auto size-1.5'" class="animate-pulse rounded-full bg-brand" title="running" />
      </RouterLink>
      <!-- The dot is steady, not pulsing: an open incident is a state, where
           the console's dots are activity. -->
      <!-- Lit only for monitoring across every project: on one suite's
           monitoring, the suite's own Monitoring section is the lit one. -->
      <RouterLink to="/monitoring" class="nav-item relative hover:bg-ink/[0.04] hover:text-ink"
                  :class="[rail && 'nav-item-rail', route.name === 'monitoring' && !route.query.suite && 'nav-item-on']"
                  :title="rail ? 'Agentic monitoring' : null" :aria-label="rail ? 'Agentic monitoring' : null">
        <Icon name="monitor" class="size-4 shrink-0" />
        <span v-if="!rail">Agentic monitoring</span>
        <span v-if="live.openIncidents" :class="rail ? 'absolute right-1 top-1 size-1.5' : 'ml-auto size-1.5'" class="rounded-full bg-critical"
              :title="`${live.openIncidents} open incident${live.openIncidents === 1 ? '' : 's'}`" />
      </RouterLink>
      <!-- Ask the thing questions in words, rather than reading its output. It
           sits with the rest of the general pages because a conversation is
           about whatever you are looking at, not about one suite. -->
      <RouterLink to="/chat" class="nav-item relative hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on"
                  :class="rail && 'nav-item-rail'" :title="rail ? 'Chat' : null" :aria-label="rail ? 'Chat' : null">
        <Icon name="chat" class="size-4 shrink-0" />
        <span v-if="!rail">Chat</span>
        <!-- A reply being written is activity, so it pulses like the console's
             running dot — and for the runner's turn in flight, whoever asked. -->
        <span v-if="chat.turn || chat.busy" :class="rail ? 'absolute right-1 top-1 size-1.5' : 'ml-auto size-1.5'"
              class="animate-pulse rounded-full bg-brand" title="a reply is being written" />
      </RouterLink>
      <!-- The conversations, hung off Chat the way a suite's sections hang off
           the suite: a fold, a new one, a search once there are enough to need
           one, and the recent ones by title with the open one lit. -->
      <div v-if="!rail" class="mb-1.5 ml-[1.05rem] mt-0.5 border-l border-hairline pl-[7px]" data-chats>
        <button type="button" :aria-expanded="ui.chatsOpen"
                class="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3 hover:bg-ink/[0.04] hover:text-ink"
                @click="ui.toggleChats()">
          <svg viewBox="0 0 16 16" class="size-3 shrink-0 transition-transform" :class="ui.chatsOpen && 'rotate-90'" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg>
          Recent chats
          <span v-if="chat.conversations.length" class="ml-auto font-normal normal-case tracking-normal tabular-nums">{{ chat.conversations.length }}</span>
        </button>
        <template v-if="ui.chatsOpen">
          <button type="button" class="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] leading-5 hover:bg-ink/[0.04] hover:text-ink"
                  :class="onChatPage && !chat.current ? 'font-medium text-brand-2' : 'text-ink-2'" @click="newChat">
            <span class="text-[14px] leading-none" aria-hidden="true">+</span> New chat
          </button>
          <input v-if="chat.conversations.length > 4" v-model="chatQuery" type="search" aria-label="Search chats" placeholder="Search chats"
                 class="mb-1 mt-0.5 w-full rounded-md border border-hairline bg-ground px-2 py-1 text-[12px] text-ink outline-none placeholder:text-ink-3 focus:border-ink/25">
          <p v-if="!chat.conversations.length" class="px-2.5 py-1 text-[12px] text-ink-3">Nothing asked yet.</p>
          <p v-else-if="!chatsShown.length" class="px-2.5 py-1 text-[12px] text-ink-3">Nothing matches.</p>
          <div v-for="c in chatsShown" :key="c.id" class="group relative">
            <button type="button" :title="c.title"
                    class="relative block w-full rounded-md py-1.5 pl-2.5 pr-7 text-left text-[12.5px] leading-5
                           before:absolute before:bottom-1.5 before:top-1.5 before:w-0.5 before:rounded-full before:left-[-8.3px] before:content-['']"
                    :class="onChatPage && chat.current?.id === c.id
                      ? 'font-medium text-brand-2 before:bg-brand'
                      : 'text-ink-3 before:bg-transparent hover:bg-ink/[0.04] hover:text-ink'"
                    @click="openChat(c.id)">
              <span class="block truncate">{{ c.title }}</span>
              <span class="block truncate text-[11px] font-normal text-ink-3">{{ when(c.updatedAt) }}<template v-if="c.proposal"> · waiting for a yes</template></span>
            </button>
            <button type="button" :aria-label="`Delete ${c.title}`" title="Delete — the runner forgets it too"
                    class="absolute right-1 top-1.5 grid size-5 place-items-center rounded text-ink-3 opacity-0 hover:bg-critical/5 hover:text-critical focus-visible:opacity-100 group-hover:opacity-100"
                    @click.stop="removeChat(c.id)">
              <svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </div>
          <button v-if="chatsMore" type="button" class="w-full rounded-md px-2.5 py-1 text-left text-[12px] text-ink-3 hover:bg-ink/[0.04] hover:text-ink"
                  @click="showAllChats = !showAllChats">{{ showAllChats ? 'Show fewer' : `Show all ${chat.conversations.length}` }}</button>
        </template>
      </div>

      <p v-if="!rail" class="eyebrow px-2 pb-2 pt-6">Admin</p>
      <div v-else class="mx-2 mt-6 mb-2 border-t border-hairline" />
      <RouterLink to="/settings" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on"
                  :class="rail && 'nav-item-rail'" :title="rail ? 'Origins &amp; vault' : null" :aria-label="rail ? 'Origins &amp; vault' : null">
        <Icon name="settings" class="size-4 shrink-0" />
        <span v-if="!rail">Origins &amp; vault</span>
      </RouterLink>
      <RouterLink v-if="session.required" to="/organisation" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on">
        <Icon name="org" class="size-4 shrink-0" />
        Organisation
      </RouterLink>
      <!-- The account's own settings exist only when there is an account:
           with no control plane there is no password to change. -->
      <RouterLink v-if="session.required" to="/security" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on">
        <Icon name="security" class="size-4 shrink-0" />
        Security
      </RouterLink>
    </nav>

    <!-- Signing in with no way to sign out is a half-built feature, and on a
         shared machine it is the half that matters. Hidden entirely when no
         control plane is configured, so the laptop case gains no dead UI.
         Last, at the foot: it is the one thing here you press on the way out. -->
    <div v-if="session.required && session.user" class="mb-1 mt-3" :class="rail ? 'mx-2' : 'mx-3'">
      <div class="flex items-center gap-2.5 rounded-xl border border-hairline bg-ground"
           :class="rail ? 'justify-center p-2' : 'px-3 py-2.5'">
        <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[11.5px] font-medium text-brand-2"
              :title="rail ? session.user.email : null">
          {{ (session.user.name || session.user.email).slice(0, 1).toUpperCase() }}
        </span>
        <span v-if="!rail" class="min-w-0 flex-1">
          <span class="block truncate text-[12.5px] font-medium text-ink" :title="session.user.email">{{ session.user.name || session.user.email }}</span>
          <span v-if="session.user.name" class="block truncate text-[11px] text-ink-3">{{ session.user.email }}</span>
        </span>
      </div>
      <!-- A row of its own, in words, not a grey link inside the card: it is
           the one thing here you press on the way out. In the rail the words
           go and the icon stays — signing out must never become unreachable. -->
      <button type="button" @click="signOut" title="Sign out" aria-label="Sign out"
              class="nav-item mt-1 w-full hover:bg-ink/[0.04] hover:text-ink" :class="rail && 'nav-item-rail'">
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 13.5H3.5v-11H6M10 11l3-3-3-3M13 8H6.5" />
        </svg>
        <span v-if="!rail">Sign out</span>
      </button>
    </div>
  </aside>
</template>
