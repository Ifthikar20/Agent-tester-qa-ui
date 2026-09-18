<script setup>
/**
 * The composer: one card, drawn in two places — under the hero while nothing
 * has been asked, and docked at the foot of a conversation. The words belong
 * to the parent (v-model), so the card can move between the two without
 * losing them, and a refusal can hand them back (ChatView submit()).
 *
 * Enter sends, Shift+Enter breaks a line; the box grows with its lines up to a
 * height that keeps the transcript in view. Stop is offered only while a run
 * tool is under way, and ends after the check in flight — the runner cannot
 * break a run off mid-step, and the reply says how far it got.
 */
import { nextTick, onMounted, ref, watch } from 'vue';
import { TEXT_MAX } from '@/stores/chat';
import Btn from '@/components/Btn.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** A question can be sent at all: connected, chat offered, chat on. */
  canSend: Boolean,
  placeholder: { type: String, default: '' },
  /** A reply to this viewer's question is being written. */
  busy: Boolean,
  /** A run tool is under way inside that reply, so Stop is offered. */
  running: Boolean,
  stopping: Boolean,
  /** Somebody else's reply is being written — one at a time per organisation. */
  otherTurn: Boolean,
});
const emit = defineEmits(['update:modelValue', 'submit', 'stop']);
const box = ref(null);

/** The box follows its lines, up to a height that keeps the transcript above it in view. */
function grow() {
  const el = box.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
}
onMounted(grow);
// The parent clears the words on send and hands them back on a refusal: both resize.
watch(() => props.modelValue, () => nextTick(grow));

defineExpose({ focus: () => box.value?.focus() });
</script>

<template>
  <div class="composer rounded-2xl border border-hairline bg-panel px-3 pb-2 pt-3 transition-[border-color,box-shadow]">
    <textarea ref="box" :value="modelValue" rows="2" :maxlength="TEXT_MAX" aria-label="Your question"
              :placeholder="placeholder" :disabled="!canSend"
              class="block w-full resize-none bg-transparent px-2 py-1.5 text-[13.5px] leading-relaxed text-ink outline-none
                     placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60"
              @input="emit('update:modelValue', $event.target.value)" @keydown.enter.exact.prevent="emit('submit')"></textarea>
    <div class="flex items-center gap-2 px-1 pt-1">
      <span class="truncate text-[11.5px] text-ink-3">Enter sends · Shift+Enter for a new line</span>
      <span v-if="modelValue.length >= TEXT_MAX - 200" class="shrink-0 text-[11.5px] tabular-nums text-ink-3">{{ modelValue.length }}/{{ TEXT_MAX }}</span>
      <span v-if="otherTurn" class="shrink-0 text-[11.5px] text-ink-3">A reply is being written…</span>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <Btn v-if="running" variant="ghost" size="sm" :disabled="stopping"
             :title="stopping ? 'Stopping after the check in flight' : 'Stop after the check in flight'" @click="emit('stop')">
          {{ stopping ? 'Stopping…' : 'Stop' }}
        </Btn>
        <button type="button" :disabled="busy || !canSend || !modelValue.trim() || otherTurn"
                :aria-label="busy ? 'Answering…' : 'Send'" :title="busy ? 'Answering…' : 'Send (Enter)'"
                class="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-on-ink hover:bg-ink/85
                       disabled:cursor-not-allowed disabled:bg-ink/[0.06] disabled:text-ink-3"
                @click="emit('submit')">
          <svg v-if="busy" class="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity=".25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
          </svg>
          <svg v-else viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14 2 2 6.5l5.5 2L9.5 14zM14 2 7.5 8.5" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The card takes the focus look the app's inputs have (Field.vue): the brand
   border and a soft ring around the whole card, in place of the page-wide
   outline on the textarea inside it — two rings on one box is one too many.
   Plain rules, not utilities, because the outline they replace is a plain rule
   too and a layered utility would lose to it. */
.composer:focus-within {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-brand) 14%, transparent);
}
.composer textarea:focus-visible { outline: none; }
</style>
