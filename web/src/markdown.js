/**
 * The markdown a reply is allowed, and no more: paragraphs, bullet and
 * numbered lists, headings drawn as bold lines, fenced code, `code` and
 * **bold**. Parsed here into a tree of plain objects and drawn by
 * components/ChatText.vue from that tree, so nothing a model writes is ever
 * handed to the DOM as HTML — a reply is text, and only ever text.
 *
 * Two departures from CommonMark, on purpose:
 *   - a newline inside a paragraph is a hard break, and only a blank line ends
 *     one. The mock mind joins a heading and its rows with bare newlines
 *     (chat-mock.js lines()), and soft-wrapping them into one paragraph would
 *     destroy exactly the structure it wrote;
 *   - a mid-line " · " is never a bullet: only a line that STARTS with a bullet
 *     mark opens a list, because " · " is how the mock separates the parts of
 *     one row ("DEF-2609-007 · high · …").
 * Everything else — a lone **, *italic*, links, tables, rules — stays literal.
 *
 * No imports, so `node -e` can exercise it without a bundler.
 */

const FENCE = /^\s*```/;
const HEADING = /^(#{1,3})\s+(.+?)\s*#*$/;
const BULLET = /^\s*[-*•·]\s+(.+)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
/** One row of a pipe table: its cells, each as inline runs. */
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => runs(c.trim()));
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.+)$/;

/**
 * One line's inline runs: `code` first (nothing is read inside it), then
 * **bold** (its content stays plain), the rest text.
 * @returns {Array<{t:'text'|'b'|'code', s:string}>}
 */
export function runs(line) {
  const out = [];
  let i = 0;
  let text = '';
  const flush = () => { if (text) { out.push({ t: 'text', s: text }); text = ''; } };
  while (i < line.length) {
    if (line[i] === '`') {
      const j = line.indexOf('`', i + 1);
      if (j > i + 1) { flush(); out.push({ t: 'code', s: line.slice(i + 1, j) }); i = j + 1; continue; }
    }
    if (line.startsWith('**', i) && /\S/.test(line[i + 2] ?? '')) {
      const j = line.indexOf('**', i + 2);
      if (j > i + 2 && /\S/.test(line[j - 1])) { flush(); out.push({ t: 'b', s: line.slice(i + 2, j) }); i = j + 2; continue; }
    }
    text += line[i++];
  }
  flush();
  return out;
}

/**
 * @typedef {{type:'p', lines: Array<ReturnType<typeof runs>>}
 *   | {type:'h', level: number, runs: ReturnType<typeof runs>}
 *   | {type:'ul', items: Array<ReturnType<typeof runs>>}
 *   | {type:'ol', start: number, items: Array<ReturnType<typeof runs>>}
 *   | {type:'code', text: string}} Block
 * @returns {Block[]}
 */
export function parse(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let cur = null;      // the block the next line may continue
  let fence = null;    // the lines of an open code fence
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (fence) {
      if (FENCE.test(raw)) { blocks.push({ type: 'code', text: fence.join('\n') }); fence = null; }
      else fence.push(raw);
      continue;
    }
    if (FENCE.test(raw)) { cur = null; fence = []; continue; }
    const line = raw.trimEnd();
    if (!line.trim()) { cur = null; continue; }
    let m;
    if ((m = HEADING.exec(line))) { cur = null; blocks.push({ type: 'h', level: m[1].length, runs: runs(m[2]) }); continue; }
    // A pipe table: a header row over a separator row, then rows until a line that is not one.
    if (TABLE_ROW.test(line)) {
      if (cur?.type === 'table') { cur.rows.push(cells(line)); continue; }
      if (TABLE_SEP.test(lines[i + 1] ?? '')) { cur = { type: 'table', head: cells(line), rows: [] }; blocks.push(cur); i++; continue; }
    }
    if ((m = BULLET.exec(line))) {
      if (cur?.type !== 'ul') { cur = { type: 'ul', items: [] }; blocks.push(cur); }
      cur.items.push(runs(m[1]));
      continue;
    }
    if ((m = NUMBERED.exec(line))) {
      if (cur?.type !== 'ol') { cur = { type: 'ol', start: Number(m[1]), items: [] }; blocks.push(cur); }
      cur.items.push(runs(m[2]));
      continue;
    }
    if (cur?.type !== 'p') { cur = { type: 'p', lines: [] }; blocks.push(cur); }
    cur.lines.push(runs(line));
  }
  // An unclosed fence — a reply still streaming, or a model that forgot — runs to the end.
  if (fence) blocks.push({ type: 'code', text: fence.join('\n') });
  return blocks;
}
