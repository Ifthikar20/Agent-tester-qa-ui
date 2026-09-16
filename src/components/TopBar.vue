<script setup>
/**
 * The bar every page shares: where you are, what the runner is doing, the
 * page's own actions — and, on every page, Help and a person. The question
 * arrives on whichever page you were on, so those two are the bar's, not a
 * page's. Support follows the runner's answer (stores/live.js `support`),
 * never its own guess: the pill says "enabled" only once the runner does.
 */
import { useLive } from '@/stores/live';
import { useUi } from '@/stores/ui';
import RunnerBusy from '@/components/RunnerBusy.vue';
defineProps({ crumbs: { type: Array, default: () => [] } });
const live = useLive();
const ui = useUi();
</script>

<template>
  <header class="sticky top-0 z-10 flex items-center gap-3 border-b border-hairline bg-ground/80 px-6 py-3.5 backdrop-blur">
    <nav class="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-3">
      <template v-for="(c, i) in crumbs" :key="i">
        <span v-if="i" aria-hidden="true">/</span>
        <RouterLink v-if="c.to" :to="c.to" class="truncate hover:text-ink">{{ c.label }}</RouterLink>
        <span v-else class="truncate font-medium text-ink">{{ c.label }}</span>
      </template>
    </nav>

    <div class="ml-auto flex items-center gap-2">
      <RunnerBusy compact />
      <span v-if="live.running"
            class="flex items-center gap-2 rounded-full border border-brand/20 bg-brand-50 px-3 py-1.5
                   text-[12.5px] font-medium text-brand-2">
        <span class="size-1.5 animate-pulse rounded-full bg-brand" /> Running
      </span>
      <slot name="actions" />
      <button type="button"
              class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px] text-ink-2 hover:border-ink/25 hover:text-ink"
              title="FAQs, documentation, and how to reach a person" aria-haspopup="dialog"
              @click="ui.openHelp()">Help</button>
      <!-- Tiny, and honest about its consequence in the title: sending a
           request turns on support access for the organisation. -->
      <button type="button" class="flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11.5px] font-medium"
              :class="live.support.enabled
                ? 'border-good/40 bg-good/10 text-good'
                : 'border-hairline text-ink-3 hover:border-ink/25 hover:text-ink'"
              :title="live.support.enabled
                ? 'Support access is on for your organisation — open to send another request or turn it off'
                : 'Request help & support — sending a request turns on support access for your organisation'"
              aria-haspopup="dialog"
              @click="ui.openSupport()">
        <span class="size-1.5 rounded-full" :class="live.support.enabled ? 'bg-good' : 'bg-ink-3/60'" />
        {{ live.support.enabled ? 'Support enabled' : 'Support' }}
      </button>
    </div>
  </header>
</template>
