<script setup>
/**
 * A test's steps, down one spine.
 *
 * The obvious thing to draw for something called a flow is a graph, and it is
 * the wrong thing. A case is a straight line — the runner walks the steps in
 * order, one after another, and stops at the first that fails — so a graph of
 * it would be a graph with no branches, which is a list drawn expensively. It
 * would also be a second answer to a question the product has already
 * answered: the runner emits mermaid for the console's report (diagram.js),
 * where there is room for a picture and a reason to want one. Two renderers
 * for the same case is how two of them come to disagree.
 *
 * What somebody actually does on this page is read the steps top to bottom and
 * find the one they care about, and that is a numbered column of cards. The
 * spine is a 1px rule, not decoration: it says the steps are one sequence
 * rather than a set of unrelated rows, which is the single thing a diagram
 * would have told them.
 *
 * The same drawing serves a plan and a report. `outcomes` is a map of step
 * index to what happened to it, so the run's verdict lands on the rows already
 * there instead of a second component rendering the same steps with ticks on
 * them. Null means nothing has happened yet, which is not the same as
 * everything having passed.
 */
import { sayAction, showAction } from '@lang';
import { stepKind } from '@/tests';

const props = defineProps({
  steps: { type: Array, default: () => [] },
  title: { type: String, default: '' },
  outcomes: { type: Object, default: null },
  foot: { type: String, default: 'End' },
});

/**
 * Pass, fail and running, never by colour alone.
 *
 * Green and red separate by only ΔE 4.1 under deuteranopia, so the glyph does
 * the work and the colour agrees with it. The word is there for a reader who
 * gets the row spoken rather than drawn — "✓" on its own is announced as
 * anything from "check mark" to nothing at all.
 */
const GLYPH = { pass: '✓', fail: '✕', run: '·' };
const TONE = { pass: 'text-good', fail: 'text-critical', run: 'text-brand' };
const WORD = { pass: 'passed', fail: 'failed', run: 'running' };

/** What happened to step `i`, but only a state this component can actually draw. */
const stateOf = (i) => {
  const s = props.outcomes?.[i];
  return s && GLYPH[s] ? s : null;
};

/**
 * Two readings of a step, both from the vocabulary rather than from a local
 * opinion about how a step reads: the sentence for somebody following the
 * test, the script line under it for somebody about to edit it.
 *
 * Both throw on an op they do not know, and a case can hold one — the parser
 * and the vocabulary are shipped together but a case written against a newer
 * runner is not impossible. A step nobody can phrase is still a step that
 * ran, so it falls back to its own fields rather than taking the page down.
 */
function describe(s) {
  if (!s) return '';
  try { return sayAction(s); }
  catch { return `${s.op} ${s.target ?? s.value ?? s.url ?? ''}`.trim(); }
}
function script(s) {
  if (!s) return '';
  try { return showAction(s) ?? ''; }
  catch { return ''; }
}
</script>

<template>
  <div class="relative">
    <!-- The spine, drawn from the first node's centre to the last one's so it
         joins them rather than overshooting into the padding. It sits behind
         the nodes, which carry the panel's own background and punch through. -->
    <span class="absolute bottom-[11px] left-[6.5px] top-[9px] w-px bg-hairline" aria-hidden="true" />

    <!-- The test itself, as the node the sequence starts from. It is in the
         brand's colour because it is the one node that is not a step. The two
         end nodes carry `leading-5` for the same reason the rule above is
         given exact offsets: the line has to meet their centres, and a line
         height left to the font would move that target on a different face. -->
    <div class="relative flex items-start gap-3">
      <span class="relative mt-0.5 size-3.5 shrink-0 rounded-full border-2 border-brand bg-panel" aria-hidden="true" />
      <p class="min-w-0 flex-1 break-words text-[13.5px] font-medium leading-5">{{ title }}</p>
    </div>

    <!-- A case with no steps is a real thing — a document that parsed to
         nothing — and an empty spine would read as a page that failed to
         load. -->
    <p v-if="!steps.length" class="ml-[26px] mt-2.5 text-[13px] text-ink-3">No steps in this test.</p>

    <ol v-else class="mt-2.5 space-y-2.5">
      <li v-for="(s, i) in steps" :key="i" class="relative flex items-start gap-3">
        <span class="relative mt-[15px] size-3.5 shrink-0 rounded-full border border-hairline bg-panel" aria-hidden="true" />

        <div class="min-w-0 flex-1 rounded-xl border border-hairline bg-panel px-4 py-3">
          <div class="flex items-start gap-2.5">
            <span class="w-5 shrink-0 text-right text-[12.5px] leading-5 tabular-nums text-ink-3">{{ i + 1 }}</span>

            <span v-if="stateOf(i)" class="w-3.5 shrink-0 text-center leading-5" :class="TONE[stateOf(i)]">
              <span v-if="stateOf(i) === 'run'" class="inline-block animate-pulse">·</span>
              <template v-else>{{ GLYPH[stateOf(i)] }}</template>
              <span class="sr-only">{{ WORD[stateOf(i)] }}</span>
            </span>

            <span class="min-w-0 flex-1 break-words text-[13.5px] leading-5">
              <!-- The kind first, because "is this a check or an errand on the
                   way to one" is the question you are scanning the column
                   with, and it is a word before it is a colour. -->
              <span class="mr-2 inline-flex items-center rounded-full px-2 py-0.5 align-middle text-[11.5px] font-medium"
                    :class="[stepKind(s).tone, stepKind(s).wash]">{{ stepKind(s).label }}</span>{{ describe(s) }}
              <!-- The exact line, under the sentence and in the type it is
                   written in: nobody has to learn the grammar to follow the
                   test, and nobody who already knows it loses it. -->
              <span v-if="script(s)" class="mt-1 block font-mono text-[11.5px] text-ink-3">{{ script(s) }}</span>
            </span>
          </div>
        </div>
      </li>
    </ol>

    <div class="relative mt-2.5 flex items-start gap-3">
      <span class="relative mt-0.5 size-3.5 shrink-0 rounded-full border border-hairline bg-panel" aria-hidden="true" />
      <p class="min-w-0 flex-1 text-[13px] leading-5 text-ink-3">{{ foot }}</p>
    </div>
  </div>
</template>
