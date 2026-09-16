<script setup>
/**
 * Light, dark, or follow the device — remembered by this browser.
 *
 * Three buttons rather than an on/off toggle, because "follow the device" is a
 * real third answer: a toggle can only say light or dark, and would quietly
 * stop tracking the operating system the moment anyone touched it. The group
 * is the console's Watch/Fast control, so it reads as one of this app's
 * controls rather than a new kind.
 *
 * Collapsed to the rail there is no room for three, so it becomes one button
 * showing the current choice, stepping to the next and saying which in its
 * title — the same shape as the rail's sign-out and collapse buttons.
 *
 * No outer margins of its own: the sidebar and the Profile page place it, and
 * a class passed in lands on whichever root is drawn.
 */
import { computed } from 'vue';
import { useUi } from '@/stores/ui';
import { CHOICES, LABEL, nextChoice } from '@/theme';

defineProps({ rail: { type: Boolean, default: false } });

const ui = useUi();

/** 16px line icons in the sidebar's own style: a sun, a moon, a screen. */
const ICONS = {
  light:  'M8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1',
  dark:   'M13.5 8.9A5.9 5.9 0 1 1 7.1 2.5a4.6 4.6 0 0 0 6.4 6.4z',
  system: 'M2.5 3.5h11V11h-11zM6 13.5h4M8 11v2.5',
};

const next = computed(() => nextChoice(ui.theme, ui.systemDark));
const now = computed(() => (ui.theme === 'system' ? `System (${ui.dark ? 'dark' : 'light'})` : LABEL[ui.theme]));
const railLabel = computed(() => `Theme: ${now.value} — switch to ${LABEL[next.value]}`);
</script>

<template>
  <button v-if="rail" type="button" :title="railLabel" :aria-label="railLabel"
          class="nav-item nav-item-rail hover:bg-ink/[0.04] hover:text-ink" @click="ui.setTheme(next)">
    <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path :d="ICONS[ui.theme]" />
    </svg>
  </button>
  <div v-else class="flex overflow-hidden rounded-full border border-hairline" role="group" aria-label="Theme">
    <button v-for="c in CHOICES" :key="c" type="button"
            class="flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap px-1 py-1.5 text-[12px]"
            :class="ui.theme === c ? 'bg-brand-50 font-medium text-brand-2' : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink'"
            :aria-pressed="ui.theme === c"
            :title="c === 'system' ? `Follow this device — ${ui.systemDark ? 'dark' : 'light'} now` : `Always ${c}`"
            @click="ui.setTheme(c)">
      <svg viewBox="0 0 16 16" class="size-3.5 shrink-0" fill="none" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path :d="ICONS[c]" />
      </svg>
      {{ LABEL[c] }}
    </button>
  </div>
</template>
