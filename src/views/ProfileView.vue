<script setup>
/**
 * Profile & settings: who you are here, and how this browser draws the app.
 *
 * The account's own pages already exist — Security for the password, the
 * second factor and the sessions; Organisation for the people you work with;
 * Origins & vault for what a run may touch — and each stays the place for its
 * change. What was missing was the page that says who you ARE, in one place,
 * and holds the one setting that belongs to the person at this browser rather
 * than to the account or the organisation: light or dark.
 *
 * The theme control is the ThemeSwitch the sidebar's foot draws, on the same
 * store (stores/ui.js), so the two can never disagree. With no control plane
 * there is no account, and the page says so rather than drawing an empty card.
 */
import { computed } from 'vue';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';
import { LABEL } from '@/theme';
import TopBar from '@/components/TopBar.vue';
import ThemeSwitch from '@/components/ThemeSwitch.vue';

const session = useSession();
const ui = useUi();

const ROLE = { owner: 'Owner', admin: 'Admin', member: 'Member' };

const initial = computed(() => (session.user?.name || session.user?.email || 'L').slice(0, 1).toUpperCase());
const role = computed(() => ROLE[session.org?.role] ?? session.org?.role ?? null);

/** What is on screen right now, in the words the switch uses. */
const drawn = computed(() => (ui.dark ? 'dark' : 'light'));
const choice = computed(() => (ui.theme === 'system'
  ? `Following this device, which is ${drawn.value} now.`
  : `Always ${LABEL[ui.theme].toLowerCase()}, whatever this device prefers.`));
</script>

<template>
  <TopBar :crumbs="[{ label: 'Profile & settings' }]" />

  <div class="mx-auto max-w-3xl px-6 py-8">
    <h1 class="display mb-1 text-3xl">Profile &amp; settings</h1>
    <p class="mb-6 max-w-2xl text-[14px] leading-relaxed text-ink-2">
      Who you are here, and how this browser draws the app.
    </p>

    <!-- The account, when there is one. -->
    <section v-if="session.required && session.user" class="card mb-4 p-5">
      <div class="flex items-center gap-4">
        <span class="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-[17px] font-medium text-brand-2">
          {{ initial }}
        </span>
        <div class="min-w-0">
          <h2 class="truncate text-[15px] font-medium">{{ session.user.name || session.user.email }}</h2>
          <p class="mt-0.5 truncate font-mono text-[12.5px] text-ink-2">{{ session.user.email }}</p>
        </div>
      </div>
      <dl class="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-hairline pt-4 text-[13px]">
        <dt class="text-ink-3">Organisation</dt>
        <dd>
          {{ session.org?.name ?? '—' }}
          <span v-if="role" class="ml-1.5 rounded-full bg-ink/[0.05] px-2 py-px text-[11.5px] font-medium text-ink-2">{{ role }}</span>
          <span v-if="session.org?.plan" class="ml-1 rounded-full bg-brand-50 px-2 py-px text-[11.5px] font-medium text-brand-2">{{ session.org.plan }}</span>
        </dd>
        <dt class="text-ink-3">Two-factor</dt>
        <dd>{{ session.mfa?.enrolled ? 'On' : 'Off' }}</dd>
      </dl>
      <div class="mt-4 flex flex-wrap gap-2">
        <RouterLink :to="{ name: 'security' }"
                    class="rounded-full border border-hairline px-4 py-2 text-[13px] font-medium hover:border-ink/25">
          Email, password &amp; two-factor
        </RouterLink>
        <RouterLink :to="{ name: 'security-sessions' }"
                    class="rounded-full border border-hairline px-4 py-2 text-[13px] font-medium hover:border-ink/25">
          Signed-in sessions
        </RouterLink>
        <RouterLink :to="{ name: 'organisation' }"
                    class="rounded-full border border-hairline px-4 py-2 text-[13px] font-medium hover:border-ink/25">
          Organisation
        </RouterLink>
      </div>
    </section>

    <!-- No control plane: the one-person, one-laptop shape. Said, not hidden,
         so nobody hunts for an account page that this runner cannot have. -->
    <section v-else class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">No sign-in on this runner</h2>
      <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
        Anyone who can reach this address can drive it, and there is no account to show.
        Start it with <code class="rounded bg-ink/[0.05] px-1 py-px font-mono text-[11.5px]">bash run.sh</code>
        for accounts, organisations and the security pages.
      </p>
    </section>

    <!-- The one setting that is the person's, not the account's. -->
    <section class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">Appearance</h2>
      <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
        Light, dark, or whatever this device prefers. Remembered by this browser, not by the account,
        so a shared runner never changes it for anyone else.
      </p>
      <div class="mt-4 max-w-xs">
        <ThemeSwitch />
      </div>
      <p class="mt-3 text-[12.5px] text-ink-3">{{ choice }}</p>
    </section>

    <section class="card p-5">
      <h2 class="text-[15px] font-medium">More settings</h2>
      <ul class="mt-3 divide-y divide-hairline text-[13px]">
        <li class="flex items-center justify-between gap-4 py-3">
          <div>
            <p class="font-medium">Origins &amp; vault</p>
            <p class="mt-0.5 text-[12.5px] text-ink-3">Which addresses a run may open, and which secret names exist.</p>
          </div>
          <RouterLink :to="{ name: 'settings' }" class="shrink-0 text-brand-2 hover:underline">Open</RouterLink>
        </li>
        <li v-if="session.required" class="flex items-center justify-between gap-4 py-3">
          <div>
            <p class="font-medium">Security</p>
            <p class="mt-0.5 text-[12.5px] text-ink-3">Email, password, two-factor authentication and sessions.</p>
          </div>
          <RouterLink :to="{ name: 'security' }" class="shrink-0 text-brand-2 hover:underline">Open</RouterLink>
        </li>
        <li v-if="session.required" class="flex items-center justify-between gap-4 py-3">
          <div>
            <p class="font-medium">Organisation</p>
            <p class="mt-0.5 text-[12.5px] text-ink-3">Members, roles, invitations and the plan.</p>
          </div>
          <RouterLink :to="{ name: 'organisation' }" class="shrink-0 text-brand-2 hover:underline">Open</RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
