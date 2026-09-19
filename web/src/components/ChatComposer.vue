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
 *
 * Files ride with the words (v-model:files): the paperclip, a drop onto the
 * card, or a paste too long to be a question, which becomes a file rather
 * than filling the box. A file is read here and sent as text — a
 * spreadsheet as base64 — under the same caps the runner keeps
 * (stores/chat.js), so a file too big is refused before it leaves.
 */
import { nextTick, onMounted, ref, watch } from 'vue';
import { ATTACHMENTS_MAX, ATTACHMENT_MAX_BYTES, ATTACHMENTS_MAX_BYTES, TEXT_MAX } from '@/stores/chat';
import Btn from '@/components/Btn.vue';
import Icon from '@/components/Icon.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** [{ name, size, kind, encoding, data }] — what will ride with the next send. */
  files: { type: Array, default: () => [] },
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
const emit = defineEmits(['update:modelValue', 'update:files', 'submit', 'stop']);
const box = ref(null);
const picker = ref(null);
const over = ref(false);
const trouble = ref(null);

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

// ---- files -----------------------------------------------------------------------------------
const ACCEPT = '.csv,.tsv,.json,.xlsx,.txt,.md,.log,.js,.mjs,.cjs,.ts,.tsx,.jsx,.py,.java,.kt,.cs,.rb,.feature,.flow';
const kb = (n) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} kB`);
/** What a file most likely is, for the chip: the runner decides for real when it reads it. */
function kindOf(name, text) {
  if (/\.(csv|tsv|xlsx|json)$/i.test(name)) return 'table';
  if (/\.flow$/i.test(name) || /^\s*(%%\s*suite|testcase\s+TD)/m.test(text ?? '')) return 'flow';
  if (/\.(js|mjs|cjs|ts|tsx|jsx|py|java|kt|cs|rb|feature)$/i.test(name) || /\b(cy|page|driver)\.\w+\s*\(/.test(text ?? '')) return 'code';
  if (/^[^\n]*[,\t;][^\n]*\n[^\n]*[,\t;]/.test(text ?? '')) return 'table';
  return 'text';
}
/** A file into the list, or the reason it cannot go. */
async function take(file, { asText = null } = {}) {
  trouble.value = null;
  const name = String(file.name ?? 'pasted.txt');
  if (props.files.length >= ATTACHMENTS_MAX) { trouble.value = `At most ${ATTACHMENTS_MAX} files in one turn.`; return; }
  if (file.size > ATTACHMENT_MAX_BYTES) { trouble.value = `${name} is ${kb(file.size)}; files up to ${kb(ATTACHMENT_MAX_BYTES)}.`; return; }
  const total = props.files.reduce((a, f) => a + f.size, 0) + file.size;
  if (total > ATTACHMENTS_MAX_BYTES) { trouble.value = `Together more than ${kb(ATTACHMENTS_MAX_BYTES)}; send some of them first.`; return; }
  let item;
  try {
    if (/\.xlsx$/i.test(name)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      item = { name, size: file.size, kind: 'table', encoding: 'base64', data: btoa(bin) };
    } else {
      const text = asText ?? await file.text();
      item = { name, size: file.size, kind: kindOf(name, text), encoding: 'text', data: text };
    }
  } catch { trouble.value = `${name} could not be read.`; return; }
  emit('update:files', [...props.files.filter((f) => f.name !== name), item]);
}
function pick(e) {
  const list = [...(e.target.files ?? [])];
  e.target.value = '';
  (async () => { for (const f of list) await take(f); })();
}
function drop(e) {
  over.value = false;
  const list = [...(e.dataTransfer?.files ?? [])];
  (async () => { for (const f of list) await take(f); })();
}
/** A long paste — many lines, or code — becomes a file rather than a wall in the box. */
function paste(e) {
  const text = e.clipboardData?.getData('text') ?? '';
  const lines = text.split('\n').length;
  const codeish = /\b(cy|page|driver)\.\w+\s*\(|^\s*(import|from|def|test|it|describe)\b/m.test(text);
  if (lines < 6 && !(codeish && lines >= 3) && text.length < 1200) return;
  e.preventDefault();
  const kind = kindOf('pasted.txt', text);
  const ext = kind === 'code' ? 'js' : kind === 'table' ? 'csv' : kind === 'flow' ? 'flow' : 'txt';
  take({ name: `pasted.${ext}`, size: new Blob([text]).size, text: async () => text }, { asText: text });
}
const remove = (name) => { trouble.value = null; emit('update:files', props.files.filter((f) => f.name !== name)); };

defineExpose({ focus: () => box.value?.focus() });
</script>

<template>
  <div class="composer rounded-2xl border bg-panel px-3 pb-2 pt-3 transition-[border-color,box-shadow]"
       :class="over ? 'border-brand' : 'border-hairline'"
       @dragover.prevent="over = true" @dragleave="over = false" @drop.prevent="drop">
    <textarea ref="box" :value="modelValue" rows="2" :maxlength="TEXT_MAX" aria-label="Your question"
              :placeholder="placeholder" :disabled="!canSend"
              class="block w-full resize-none bg-transparent px-2 py-1.5 text-[13.5px] leading-relaxed text-ink outline-none
                     placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60"
              @input="emit('update:modelValue', $event.target.value)" @keydown.enter.exact.prevent="emit('submit')" @paste="paste"></textarea>
    <!-- The files riding with the next send: a name, a size, a way out. -->
    <ul v-if="files.length" class="flex flex-wrap gap-1.5 px-1 pb-1" aria-label="Attached files">
      <li v-for="f in files" :key="f.name" class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-hairline bg-ground px-2.5 py-0.5 text-[11.5px] text-ink-2">
        <Icon :name="f.kind === 'code' || f.kind === 'flow' ? 'code' : f.kind === 'table' ? 'chart' : 'list'" class="size-3 shrink-0 text-ink-3" />
        <span class="truncate">{{ f.name }}</span>
        <span class="shrink-0 text-ink-3">{{ kb(f.size) }}</span>
        <button type="button" class="ml-0.5 shrink-0 text-ink-3 hover:text-critical" :aria-label="`Remove ${f.name}`" @click="remove(f.name)">✕</button>
      </li>
    </ul>
    <p v-if="trouble" class="px-1 pb-1 text-[11.5px] text-critical">{{ trouble }}</p>
    <!-- The hint gives way first (it grows into the room and truncates); the
         notes and the buttons never shrink, and on a phone the row wraps under
         them rather than pushing the send button out of the card. -->
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 pt-1">
      <input ref="picker" type="file" multiple :accept="ACCEPT" class="hidden" @change="pick">
      <button type="button" class="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-ink/[0.05] hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="!canSend" aria-label="Attach a file" title="Attach a file: test code to turn into checks, or a CSV, JSON or spreadsheet to read and chart"
              @click="picker?.click()">
        <Icon name="paperclip" class="size-4" />
      </button>
      <span class="min-w-0 flex-1 truncate text-[11.5px] text-ink-3">Enter sends · Shift+Enter for a new line</span>
      <span v-if="modelValue.length >= TEXT_MAX - 200" class="shrink-0 text-[11.5px] tabular-nums text-ink-3">{{ modelValue.length }}/{{ TEXT_MAX }}</span>
      <span v-if="otherTurn" class="shrink-0 text-[11.5px] text-ink-3">A reply is being written…</span>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <Btn v-if="running" variant="ghost" size="sm" :disabled="stopping"
             :title="stopping ? 'Stopping after the check in flight' : 'Stop after the check in flight'" @click="emit('stop')">
          {{ stopping ? 'Stopping…' : 'Stop' }}
        </Btn>
        <button type="button" :disabled="busy || !canSend || (!modelValue.trim() && !files.length) || otherTurn"
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
