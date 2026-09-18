<script setup>
/**
 * The conversations this organisation has had with the runner, as a panel
 * that slides over the page (HelpPanel's shape): find one, open it, start a
 * new one, or delete one. The rows are the runner's (stores/chat.js
 * conversations — the twenty it keeps), filtered here by title and by the last
 * thing said, since twenty rows never need an index. Escape and the scrim
 * close it; the parent puts focus back where it came from.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { when } from '@/time';

const props = defineProps({
  /** Newest first: { id, title, updatedAt, last?: { text }, proposal? } */
  rows: { type: Array, default: () => [] },
  currentId: { type: String, default: null },
});
const emit = defineEmits(['open', 'fresh', 'remove', 'close']);

const q = ref('');
const search = ref(null);
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase();
  if (!needle) return props.rows;
  return props.rows.filter((c) => `${c.title ?? ''}\n${c.last?.text ?? ''}`.toLowerCase().includes(needle));
});

function onKey(e) { if (e.key === 'Escape') emit('close'); }
onMounted(() => { window.addEventListener('keydown', onKey); nextTick(() => search.value?.focus()); });
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-30 flex justify-end bg-ink/40" @click.self="emit('close')">
      <aside class="flex h-full w-full max-w-sm flex-col border-l border-hairline bg-panel shadow-2xl"
             role="dialog" aria-modal="true" aria-labelledby="chat-history-title">
        <header class="flex items-center gap-3 border-b border-hairline px-5 py-4">
          <h2 id="chat-history-title" class="text-[16px] font-medium">Conversations</h2>
          <span class="text-[12.5px] text-ink-3">{{ rows.length }} kept on the runner</span>
          <button type="button" class="ml-auto grid size-8 place-items-center rounded-full text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
                  aria-label="Close" title="Close (Esc)" @click="emit('close')">
            <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <div class="border-b border-hairline px-4 py-3">
          <input ref="search" v-model="q" type="search" aria-label="Search conversations" placeholder="Search by title or last words"
                 class="w-full rounded-full border border-hairline bg-ground px-3.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-ink-3 focus:border-ink/25">
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <button type="button" class="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium hover:bg-ink/[0.03]"
                  :class="currentId ? 'text-ink' : 'bg-brand-50 text-brand-2'" @click="emit('fresh')">
            <span class="text-[15px] leading-none" aria-hidden="true">+</span> New conversation
          </button>
          <p v-if="!shown.length" class="px-3 py-6 text-center text-[12.5px] text-ink-3">
            {{ rows.length ? 'Nothing matches' : 'No conversations yet' }}
          </p>
          <ul v-else class="space-y-0.5">
            <li v-for="c in shown" :key="c.id" class="group flex items-stretch gap-0.5">
              <button type="button" class="min-w-0 flex-1 rounded-xl px-3 py-2 text-left hover:bg-ink/[0.03]"
                      :class="c.id === currentId && 'bg-brand-50'" @click="emit('open', c.id)">
                <span class="flex items-baseline gap-2">
                  <span class="min-w-0 flex-1 truncate text-[13px] font-medium" :class="c.id === currentId ? 'text-brand-2' : 'text-ink'">{{ c.title }}</span>
                  <span v-if="c.proposal" class="size-1.5 shrink-0 self-center rounded-full bg-brand" title="Waiting for a yes" />
                  <span class="shrink-0 text-[11px] text-ink-3">{{ when(c.updatedAt) }}</span>
                </span>
                <span v-if="c.last?.text" class="mt-0.5 block truncate text-[12px] text-ink-2">{{ c.last.text }}</span>
              </button>
              <!-- A sibling, not a child: a button inside a button is not HTML. -->
              <button type="button"
                      class="grid w-8 shrink-0 place-items-center rounded-lg text-ink-3 opacity-0 hover:bg-critical/5 hover:text-critical
                             focus-visible:opacity-100 group-hover:opacity-100"
                      :aria-label="`Delete ${c.title}`" title="Delete — the runner forgets it too" @click="emit('remove', c.id)">
                <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8M6.8 7v3.5M9.2 7v3.5" />
                </svg>
              </button>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
