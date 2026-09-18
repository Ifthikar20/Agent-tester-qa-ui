<script>
/**
 * A reply's text, drawn from the tree markdown.js parsed.
 *
 * Every node here is built with h() from strings, so a model's words reach
 * the DOM as text and only ever as text — there is no v-html anywhere in the
 * chat, and this component is why there does not need to be. `tone` picks the
 * ink: an answer, the runner's own muted note, or a dead turn in red; the box
 * around a note or an error is the caller's class, which lands on the root.
 * `caret` is the blinking cursor a streaming reply carries (ChatView), placed
 * inside the last block so it sits after the last word. A pipe table is drawn
 * as one; a quoted README section is full of them.
 */
import { computed, h } from 'vue';
import { parse } from '@/markdown';

const INK = { answer: 'text-ink', note: 'text-ink-2', error: 'text-critical' };

const caret = () => h('span', { class: 'ml-0.5 inline-block h-[1em] w-0.5 translate-y-0.5 animate-pulse bg-current', 'aria-hidden': 'true' });

const inline = (rs) => rs.map((r) => (
  r.t === 'b' ? h('strong', { class: 'font-semibold' }, r.s)
    : r.t === 'code' ? h('code', { class: 'rounded bg-ink/[0.05] px-1 py-px font-mono text-[12px]' }, r.s)
      : r.s));

/** A paragraph's lines, joined by real newlines that `whitespace-pre-wrap` keeps. */
const lined = (lines) => lines.flatMap((rs, i) => (i ? ['\n', ...inline(rs)] : inline(rs)));

const items = (list, tail) => list.map((rs, j) => h('li', null, [...inline(rs), ...(j === list.length - 1 ? tail : [])]));

export default {
  name: 'ChatText',
  props: {
    text: { type: String, default: '' },
    tone: { type: String, default: 'answer' },
    caret: Boolean,
  },
  setup(props) {
    const blocks = computed(() => parse(props.text));
    return () => {
      const all = blocks.value;
      const nodes = all.map((b, i) => {
        const tail = props.caret && i === all.length - 1 ? [caret()] : [];
        switch (b.type) {
          case 'h': return h('p', { class: b.level === 1 ? 'text-[15px] font-semibold' : 'font-semibold' }, [...inline(b.runs), ...tail]);
          case 'ul': return h('ul', { class: 'list-disc space-y-1 pl-5 marker:text-ink-3' }, items(b.items, tail));
          case 'ol': return h('ol', { class: 'list-decimal space-y-1 pl-5 tabular-nums marker:text-ink-3', start: b.start }, items(b.items, tail));
          // A table keeps its words whole and scrolls sideways in its box: the root's
          // break-anywhere would otherwise split "Expectations" down a narrow column.
          case 'table': return h('div', { class: 'overflow-x-auto' }, h('table', { class: 'w-full text-left text-[12.5px] [overflow-wrap:normal]' }, [
            h('thead', { class: 'table-head' }, h('tr', null, b.head.map((c) => h('th', { class: 'whitespace-nowrap px-2 py-1 font-medium' }, inline(c))))),
            h('tbody', null, b.rows.map((r) => h('tr', { class: 'border-t border-hairline' }, r.map((c) => h('td', { class: 'px-2 py-1 align-top' }, inline(c)))))),
          ]));
          case 'code': return h('pre', { class: 'overflow-x-auto rounded-lg border border-hairline bg-panel px-3 py-2 font-mono text-[12px] leading-relaxed' }, [h('code', null, b.text), ...tail]);
          default: return h('p', { class: 'whitespace-pre-wrap' }, [...lined(b.lines), ...tail]);
        }
      });
      if (props.caret && !nodes.length) nodes.push(h('p', null, [caret()]));
      return h('div', { class: ['space-y-2 text-[13.5px] leading-relaxed [overflow-wrap:anywhere]', INK[props.tone] ?? INK.answer] }, nodes);
    };
  },
};
</script>
