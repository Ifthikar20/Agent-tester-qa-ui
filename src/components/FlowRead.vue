<script setup>
/**
 * A case you can check at a glance.
 *
 * A recording in its raw form is a wall of monospace — names a paragraph long,
 * an entry fingerprint of forty targets, a coordinate comment for every click —
 * and somewhere in it, the nine things you did. So the same text has two views.
 *
 * Steps, the default: each one in order under the page it happens on, the verb
 * in its own colour, and anything worth a second look — a $TODO, an element
 * picked by position, a name that is a whole paragraph — said beside the step
 * instead of left for a replay to find. Source: the text itself, coloured the
 * same way, with the recording's evidence folded away until you ask for it.
 *
 * An address is drawn as what it is: blue, underlined, and a real link that
 * opens the page in a new tab. An element that is a link on the page is blue
 * too, though from here it has nowhere to go.
 *
 * It reads; it never decides. What runs is whatever the runner parses.
 */
import { computed, ref, watch } from 'vue';
import { linkFor, readFlow, scopeLabel } from '@/readflow';
import { TOKEN, TONE } from '@/flowcolors';
import { concernCount, concernLabel, isThinking, notesByIndex, offeredFix, thinkingCount } from '@/stepnotes';
import FlowLegend from '@/components/FlowLegend.vue';

const props = defineProps({
  flow: { type: String, default: '' },
  /** The height the textarea it replaces would have had, in rows. */
  rows: { type: Number, default: 10 },
  /**
   * What the runner worked out about each step while it was recorded
   * (stepnotes.js), by step index: Thinking… while it reads the page, what the
   * step did, and anything that looks like a recording mistake. Only a live
   * recording has any.
   */
  notes: { type: Array, default: () => [] },
});
/** A note's fix, pressed. The parent sends it to the runner, which alone changes a recording. */
const emit = defineEmits(['fix']);

const VIEWS = [['steps', 'Steps'], ['source', 'Source']];
const view = ref('steps');
const evidence = ref(false);
const expanded = ref(new Set());

const read = computed(() => readFlow(props.flow));
/** The source, each address resolved once here rather than for every token on every render. */
const lines = computed(() => read.value.lines
  .filter((l) => evidence.value || l.kind !== 'evidence')
  .map((l) => ({ ...l, tokens: l.tokens.map((tk) => (tk.c === 'link' ? { ...tk, href: linkFor(tk.t, read.value.base) } : tk)) })));
const maxHeight = computed(() => `${Math.max(props.rows, 6) * 1.9}rem`);

const SHORT = 64;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const long = (s) => s.name.length > SHORT;
const nameOf = (s) => (long(s) && !expanded.value.has(s.index) ? `${s.name.slice(0, SHORT).trimEnd()}…` : s.name);
function toggle(s) {
  const next = new Set(expanded.value);
  if (next.has(s.index)) next.delete(s.index);
  else next.add(s.index);
  expanded.value = next;
}

const byIndex = computed(() => notesByIndex(props.notes));
const noteOf = (s) => byIndex.value.get(s.index) ?? null;
/** The steps whose notes are opened to show what the AI noticed. */
const opened = ref(new Set());
// Kept by step index, and a step taken out moves every index after it.
watch(() => read.value.steps.length, (now, before) => { if (now < before) opened.value = new Set(); });
function toggleNote(s) {
  const next = new Set(opened.value);
  if (next.has(s.index)) next.delete(s.index);
  else next.add(s.index);
  opened.value = next;
}

const LINK = 'text-code-link underline decoration-code-link/30 underline-offset-2 hover:decoration-code-link';
/** A link on the page reads as a link here too; any other element is just its name. */
const nameColour = (s) => (s.role === 'link' ? 'text-code-link' : 'text-ink');
</script>

<template>
  <!-- contain:inline-size — a source line is never wrapped, and without this
       its width became the card's, pushing the card past the column it sits in.
       The textarea this replaced was sized by its own box, not by its text. -->
  <div class="overflow-hidden rounded-xl border border-hairline bg-ground [contain:inline-size]">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline bg-panel px-3.5 py-2 text-[12px] text-ink-3">
      <span v-if="read.suite" class="max-w-[14rem] truncate font-medium text-ink" :title="read.suite">{{ read.suite }}</span>
      <span>{{ plural(read.counts.actions, 'action') }}</span>
      <span class="text-code-check">{{ plural(read.counts.checks, 'check') }}</span>
      <span>{{ plural(read.counts.pages, 'page') }}</span>
      <span v-if="read.counts.warnings" class="font-medium text-code-todo">{{ read.counts.warnings }} to look at</span>
      <span v-if="thinkingCount(notes)" class="flex items-center gap-1 text-brand-2" role="status">
        <span class="size-1.5 animate-pulse rounded-full bg-brand motion-reduce:animate-none" aria-hidden="true" />
        Thinking…
      </span>
      <span v-if="concernCount(notes)" class="font-medium text-warn">{{ plural(concernCount(notes), 'step') }} flagged</span>
      <span class="ml-auto flex items-center gap-2.5">
        <button v-if="view === 'source' && read.evidence.lines" type="button"
                class="text-ink-3 underline decoration-ink-3/40 underline-offset-2 hover:text-ink"
                :aria-pressed="evidence" @click="evidence = !evidence">
          {{ evidence ? 'Hide' : 'Show' }} evidence · {{ read.evidence.lines }}
        </button>
        <span class="flex overflow-hidden rounded-full border border-hairline" role="group" aria-label="Show this case as">
          <button v-for="[id, label] in VIEWS" :key="id" type="button" class="px-2.5 py-0.5"
                  :class="view === id ? 'bg-brand-50 font-medium text-brand-2' : 'text-ink-3 hover:bg-ink/[0.04]'"
                  :aria-pressed="view === id" @click="view = id">{{ label }}</button>
        </span>
      </span>
    </div>

    <div v-if="view === 'steps'" class="overflow-y-auto" :style="{ maxHeight }">
      <p v-if="!read.steps.length" class="px-3.5 py-3 text-[12.5px] text-ink-3">No steps yet.</p>
      <section v-for="(g, gi) in read.groups" :key="gi" class="border-b border-hairline last:border-b-0">
        <!-- The page, pinned while its steps scroll under it. -->
        <p class="sticky top-0 z-[1] flex items-center gap-2 bg-ground px-3.5 pb-1 pt-2 text-[12px]">
          <span class="grid size-4 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-semibold text-white">{{ gi + 1 }}</span>
          <a v-if="g.href" :href="g.href" target="_blank" rel="noopener noreferrer"
             class="min-w-0 truncate font-mono font-medium" :class="LINK" :title="`Open ${g.href} in a new tab`">{{ g.place }}</a>
          <span v-else class="min-w-0 truncate font-mono font-medium text-ink" :title="g.place">{{ g.place }}</span>
        </p>
        <ol class="pb-2">
          <li v-for="s in g.steps" :key="s.index"
              class="grid grid-cols-[1.75rem_3.5rem_minmax(0,1fr)] items-baseline gap-x-2 px-3.5 py-[3px] text-[12.5px] leading-relaxed">
            <span class="text-right font-mono text-[11px] tabular-nums text-ink-3"
                  :title="s.at ? `Recorded at ${s.at.x},${s.at.y}` : undefined">{{ s.n }}</span>
            <span class="font-mono font-semibold" :class="TONE[s.tone]">{{ s.verb }}</span>
            <span class="min-w-0 break-words">
              <span v-if="s.detail" class="mr-1.5" :class="TONE[s.tone]">{{ s.detail }}</span>
              <a v-if="s.href" :href="s.href" target="_blank" rel="noopener noreferrer"
                 class="font-mono text-[12px]" :class="LINK" :title="`Open ${s.href} in a new tab`">{{ s.name }}</a>
              <button v-else-if="s.name && long(s)" type="button" class="text-left hover:underline" :class="nameColour(s)"
                      :title="expanded.has(s.index) ? 'Show less' : s.name" @click="toggle(s)">{{ nameOf(s) }}</button>
              <span v-else-if="s.name" :class="[nameColour(s), s.kind === 'open' && 'font-mono text-[12px]']">{{ s.name }}</span>
              <span v-if="s.scope" class="ml-1.5 rounded bg-ink/[0.05] px-1 py-px font-mono text-[11px] text-ink-2">{{ scopeLabel(s.scope) }}</span>
              <span v-if="s.role" class="ml-1.5 font-mono text-[11px]" :class="s.role === 'link' ? 'text-code-link' : 'text-code-role'">{{ s.role }}</span>
              <span v-if="s.after" class="ml-1.5" :class="TONE[s.tone]">{{ s.after }}</span>
              <span v-if="s.value != null" class="ml-1.5 font-mono text-code-value">= '{{ s.value }}'</span>
              <span v-if="s.vault" class="ml-1.5 font-mono"
                    :class="s.vault === 'TODO' ? 'rounded bg-code-todo/10 px-1 font-semibold text-code-todo' : 'text-code-vault'">← ${{ s.vault }}</span>
              <span v-if="s.warn" class="mt-0.5 block text-[11.5px] text-code-todo">⚠ {{ s.warn }}</span>
              <!-- What the runner worked out about this step as it was recorded
                   (stepnotes.js): Thinking… while it reads the page, then one line
                   of what the step did — what the AI noticed opens under it — and
                   anything that looks like a recording mistake, with the fix a
                   person can apply. Text only: the words are the model's. -->
              <template v-if="noteOf(s)">
                <span v-if="isThinking(noteOf(s))" class="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
                  <span class="flex shrink-0 gap-0.5 motion-reduce:hidden" aria-hidden="true">
                    <span v-for="d in 3" :key="d" class="size-1 rounded-full bg-brand opacity-25 animate-[thinking-dot_1.2s_ease-in-out_infinite]"
                          :style="{ animationDelay: `${(d - 1) * 0.16}s` }" />
                  </span>
                  Thinking…
                </span>
                <span v-if="noteOf(s).summary" class="mt-0.5 flex items-baseline gap-1.5 text-[11.5px] text-ink-2">
                  <span class="shrink-0 rounded px-1 text-[10px] font-medium"
                        :class="noteOf(s).tier === 'ai' ? 'bg-brand-50 text-brand-2' : 'bg-ink/[0.06] text-ink-3'">{{ noteOf(s).tier === 'ai' ? 'AI' : 'Rule' }}</span>
                  <button v-if="noteOf(s).noticed?.length" type="button" class="min-w-0 text-left hover:text-ink"
                          :aria-expanded="opened.has(s.index)" :title="opened.has(s.index) ? 'Hide what it noticed' : 'Show what it noticed'"
                          @click="toggleNote(s)">{{ noteOf(s).summary }} <span class="text-ink-3" aria-hidden="true">{{ opened.has(s.index) ? '▾' : '▸' }}</span></button>
                  <span v-else class="min-w-0">{{ noteOf(s).summary }}</span>
                </span>
                <ul v-if="opened.has(s.index) && noteOf(s).noticed?.length"
                    class="mb-0.5 ml-1 mt-0.5 space-y-px border-l border-hairline pl-2 text-[11px] text-ink-3">
                  <li v-for="(fact, k) in noteOf(s).noticed" :key="k">{{ fact }}</li>
                </ul>
                <span v-if="noteOf(s).concern" class="mt-0.5 block text-[11.5px] text-warn">
                  <span class="font-medium">⚠ {{ concernLabel(noteOf(s).concern.kind) }}:</span>
                  {{ noteOf(s).concern.text }}
                  <button v-if="offeredFix(noteOf(s))" type="button"
                          class="ml-1 rounded border border-warn/40 px-1.5 py-px align-[1px] text-[11px] font-medium hover:bg-warn/10"
                          @click="emit('fix', noteOf(s))">{{ offeredFix(noteOf(s)).label }}</button>
                </span>
              </template>
            </span>
          </li>
        </ol>
      </section>
    </div>

    <div v-else class="overflow-auto" :style="{ maxHeight }">
      <div class="min-w-max px-3.5 py-3 font-mono text-[12.5px] leading-relaxed">
        <div v-for="(l, i) in lines" :key="i" class="min-h-[1.625em] whitespace-pre"><template v-for="(tk, j) in l.tokens" :key="j"><a v-if="tk.href" :href="tk.href" target="_blank" rel="noopener noreferrer" :class="TOKEN[tk.c]">{{ tk.t }}</a><span v-else :class="TOKEN[tk.c]">{{ tk.t }}</span></template></div>
      </div>
    </div>

    <FlowLegend :read="read" class="border-t border-hairline bg-panel" />
  </div>
</template>
