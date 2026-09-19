/**
 * Agentic monitoring — the pure half of the page.
 *
 * What a snapshot, a check, a monitor or an incident reads as, with no store
 * and no DOM in sight, so MonitoringView.vue is a template and some wiring.
 * The runner's shapes are the monitoring proof of concept's; the words are
 * its where they were good.
 *
 * A snapshot (the picker's `monitor.selected`) is the page agent's `measure()`:
 * `{ exists, visible, tag, id, classes, rect{w,h}, styles{fontSize,fontWeight,
 * color}, metrics{fontSizePx}, text, textLength, counts{rows,children} }`.
 * A monitor's `metrics` is the runner's `summarize()`: `{ exists, visible,
 * fontSize, width, height, rowCount, textLength, childElementCount }` — with
 * `kind: 'page'` and `blocks` for a monitor on the whole page.
 */

/**
 * The reserved selector of a monitor on the whole page: not an element but
 * every block on it (the runner's core.js measurePage), watched for any
 * change to its layout or its words.
 */
export const PAGE_SELECTOR = ':page';
export const isPageMonitor = (m) => !!m && m.selector === PAGE_SELECTOR;
/** A selector as a card shows it: the whole page has no selector to show. */
export const selectorLine = (sel) => (sel === PAGE_SELECTOR ? 'the whole page' : sel);
/** What a rule about the whole page can say, in the phrasing the runner reads (compilePageRule). */
export const PAGE_RULES = ['Nothing on the page may change', 'The layout must not change', 'The text must not change'];

/** Nothing open: null, or Chrome's blank page, which is truthy and not a page. */
export const isBlank = (url) => !url || url === 'about:blank';

const STATE_CLASS = /^(active|open|opened|closed|selected|hover|hovered|focus|focused|checked|disabled|visible|hidden|show|shown|collapsed|expanded|is-|has-|js-)/;

/** `p#intro.hero`, the way DevTools would name it. */
export function describeElement(snap) {
  if (!snap || !snap.tag) return '';
  let s = snap.tag;
  if (snap.id) s += `#${snap.id}`;
  const cls = (snap.classes ?? []).filter((c) => !STATE_CLASS.test(c)).slice(0, 2);
  if (cls.length) s += `.${cls.join('.')}`;
  return s;
}

/** Rules worth offering for this element, in the phrasing the mock compiler reads. */
export function suggestionsFor(snap) {
  const out = [];
  if (!snap || snap.exists === false) return out;
  const fs = snap.metrics?.fontSizePx;
  out.push('Width and height must not change');
  if (fs != null) {
    out.push(`Font size must not exceed ${Math.ceil(fs) + 2}px`);
    out.push(`Font size must stay ${Math.round(fs)}px`);
  }
  if (snap.rect) out.push(`Height must not exceed ${Math.ceil(snap.rect.h)}px`);
  out.push('Must always be visible');
  if (snap.textLength > 0 && snap.textLength < 400) out.push('Text must not change');
  if (snap.counts?.rows != null) out.push(`Must keep exactly ${snap.counts.rows} rows`);
  return out;
}

/**
 * The rule a pick starts with — the script that exists the moment the element
 * is chosen, in the phrasing the mock compiler reads (the README's table):
 * "nothing about it may quietly change", spelled out for this element. A
 * table keeps its rows; anything else its size; something with readable text
 * keeps its words. There to be edited, not invented from a blank box.
 */
export function defaultRule(snap) {
  const parts = ['Must exist and always be visible'];
  if (!snap || snap.exists === false) return parts[0];
  if (snap.counts?.rows != null) parts.push(`must keep exactly ${snap.counts.rows} rows`);
  else parts.push('width and height must not change');
  if (snap.textLength > 0 && snap.textLength < 400) parts.push('text must not change');
  return parts.join('; ');
}

/** `button.cta “Get started” · 128×34 · 14px` — what the picker is over, in one line. */
export function hoverLine(h) {
  if (!h) return '';
  let s = h.describe || h.tag || 'element';
  if (h.text) s += ` “${h.text.length > 40 ? `${h.text.slice(0, 40)}…` : h.text}”`;
  if (h.w || h.h) s += ` · ${h.w}×${h.h}`;
  if (h.fontSize) s += ` · ${h.fontSize}`;
  return s;
}

/** The path of a monitored page, for "runs every time /pricing is opened". */
export function pathOfUrl(u) {
  try { const x = new URL(u); return (x.pathname || '/') + x.search; } catch { return u || 'this page'; }
}

/** [label, value] pairs for the facts list under a picked element. */
export function elementFacts(snap) {
  if (!snap || snap.exists === false) return [];
  const facts = [];
  if (snap.rect) facts.push(['Size', `${Math.round(snap.rect.w)} × ${Math.round(snap.rect.h)} px`]);
  const fs = snap.styles?.fontSize ?? (snap.metrics?.fontSizePx != null ? `${snap.metrics.fontSizePx}px` : null);
  if (fs) facts.push(['Font', [fs, snap.styles?.fontWeight].filter(Boolean).join(' / ') + (snap.styles?.color ? ` · ${snap.styles.color}` : '')]);
  facts.push(['Visible', snap.visible ? 'yes' : 'no']);
  if (snap.counts?.rows != null) facts.push(['Rows', String(snap.counts.rows)]);
  if (snap.counts?.children) facts.push(['Children', String(snap.counts.children)]);
  if (snap.text) facts.push(['Text', snap.text.slice(0, 90) + (snap.text.length > 90 ? '…' : '')]);
  return facts;
}

/** `16px · 640×48 · 5 rows · visible` — a monitor's live numbers, in one line; `38 blocks · 1180×2140 · 2 310 chars` for the whole page. */
export function metricsLine(m) {
  if (!m) return 'no measurement yet';
  if (m.exists === false) return 'element missing';
  if (m.kind === 'page') {
    const parts = [`${m.blocks ?? 0} blocks`];
    if (m.width != null && m.height != null) parts.push(`${Math.round(m.width)}×${Math.round(m.height)}`);
    if (m.textLength != null) parts.push(`${m.textLength} chars`);
    return parts.join(' · ');
  }
  const parts = [];
  if (m.fontSize != null) parts.push(`${m.fontSize}px`);
  if (m.width != null && m.height != null) parts.push(`${Math.round(m.width)}×${Math.round(m.height)}`);
  if (m.rowCount != null) parts.push(`${m.rowCount} rows`);
  parts.push(m.visible === false ? 'hidden' : 'visible');
  return parts.join(' · ');
}

/** One compiled check as a chip: `fontSize ≤ 18`, `width unchanged`, `Δheight ≤ 40`. */
export function chipText(c) {
  const rel = c.compareToBaseline ? 'Δ' : '';
  const v = c.value;
  // The runner keeps `value` as text, so "false" is the string.
  const off = String(v) === 'false';
  switch (c.op) {
    case 'lte': return `${c.metric} ≤ ${rel}${v}`;
    case 'gte': return `${c.metric} ≥ ${rel}${v}`;
    case 'eq': return `${c.metric} = ${rel}${v}`;
    case 'neq': return `${c.metric} ≠ ${v}`;
    case 'between': return `${c.metric} ${rel}${c.min}–${c.max}`;
    case 'unchanged': return c.metric === 'content' ? 'words unchanged' : `${c.metric} unchanged`;
    case 'contains': return `${c.metric} contains "${v}"`;
    case 'not_contains': return `${c.metric} without "${v}"`;
    case 'exists': return off ? 'must not exist' : 'must exist';
    case 'visible': return off ? 'must be hidden' : 'must be visible';
    default: return `${c.metric} ${c.op}`;
  }
}

/** The chips on a monitor card: its checks, then where they came from. */
export function specChips(m) {
  const out = (m.spec?.checks ?? []).map((c) => ({ text: chipText(c), tone: 'neutral', title: c.message ?? '' }));
  if (m.specSource === 'provisional') out.push({ text: 'compiling with Claude…', tone: 'info', title: 'The mock compiler’s checks run meanwhile' });
  else if (m.specSource === 'claude') out.push({ text: 'compiled by Claude', tone: 'info', title: m.spec?.summary ?? '' });
  // The mock's checks, and nothing went wrong on the way: said, so no card
  // leaves "who compiled this?" unanswered. Gone wrong, the fallback chip says.
  else if (m.specSource === 'mock' && !m.specError) out.push({ text: 'compiled by rules', tone: 'neutral', title: 'the mock compiler’s checks' });
  if (m.specError) out.push({ text: 'mock fallback', tone: 'warn', title: m.specError });
  // A spec with clauses says which clause is judged (clauseChips); the one
  // chip is for monitors written before clauses were kept.
  if (m.spec?.needsLlmJudgment && !m.spec.clauses?.length) out.push({ text: 'needs judgment', tone: 'warn', title: m.spec.judgmentHint ?? '' });
  return out;
}

/** A clause as it fits on a chip: whole up to ~70 characters, then an ellipsis. */
const CLAUSE_CHIP_MAX = 70;
const clip = (t) => (t.length > CLAUSE_CHIP_MAX ? `${t.slice(0, CLAUSE_CHIP_MAX - 1).trimEnd()}…` : t);

/**
 * One chip per clause of the rule as the engineer wrote it, in order, saying
 * what became of it: the checks it turned into, a call the runner makes on
 * every confirmed change (or cannot make, without a key), or words nobody
 * understood. This is the honest half of a spec — a clause that quietly
 * vanished in compilation is a rule nobody is checking, and the chips are
 * where that would show. Older specs have no clauses and get no chips.
 */
export function clauseChips(spec, llmMode) {
  const checks = spec?.checks ?? [];
  return (spec?.clauses ?? []).map((c) => {
    const text = clip(String(c.text ?? '').trim());
    if (c.outcome === 'checks') {
      const named = (c.checkIds ?? []).map((id) => checks.find((k) => k.id === id)?.message).filter(Boolean);
      return { text: `✓ ${text}`, tone: 'neutral', title: named.join(' · ') };
    }
    if (c.outcome === 'judgment') {
      return llmMode === 'claude'
        ? { text: `judged on change: ${text}`, tone: 'info', title: 'Claude reads the markup before and after each confirmed change and decides' }
        : { text: `needs a key to judge: ${text}`, tone: 'warn', title: 'set ANTHROPIC_API_KEY — meanwhile the element is watched for any change' };
    }
    return { text: `not understood: ${text}`, tone: 'warn', title: 'No check came of these words — try saying it another way' };
  });
}

/** `fontSize: 16 → 36`, one per metric that moved — or, for the whole page, `4 added · 9 moved`. */
export function diffChips(diff) {
  return Object.entries(diff ?? {}).flatMap(([k, v]) => {
    if (k === 'pageChanges') {
      const t = v?.totals ?? {};
      return [['added', t.added], ['removed', t.removed], ['moved', t.moved], ['reworded', t.changed]].filter(([, n]) => n > 0).map(([w, n]) => `${n} ${w}`);
    }
    return [k === 'htmlChanged' ? 'markup changed' : Array.isArray(v) ? `${k}: ${v[0]} → ${v[1]}` : `${k}: ${v}`];
  });
}

const short = (t, n = 40) => (typeof t === 'string' && t.length > n ? `${t.slice(0, n - 1)}…` : (t ?? ''));
/** `section#orders “Orders”` — a block of the page, named. */
export function blockName(b) {
  if (!b) return 'a block';
  let s = String(b.t || 'block') + (b.id ? `#${b.id}` : '');
  if (b.text) s += ` “${short(b.text)}”`;
  return s;
}
/** `down 32px, 30px taller` — how a block moved. */
export function moveWords(b) {
  const out = [];
  if (b.dy) out.push(`${b.dy > 0 ? 'down' : 'up'} ${Math.abs(Math.round(b.dy))}px`);
  if (b.dx) out.push(`${b.dx > 0 ? 'right' : 'left'} ${Math.abs(Math.round(b.dx))}px`);
  if (b.dh) out.push(`${Math.abs(Math.round(b.dh))}px ${b.dh > 0 ? 'taller' : 'shorter'}`);
  if (b.dw) out.push(`${Math.abs(Math.round(b.dw))}px ${b.dw > 0 ? 'wider' : 'narrower'}`);
  return out.join(', ') || 'moved';
}
/**
 * One line per sampled change on the whole page: what was added, what went,
 * what moved and what was reworded (the runner's diffPage samples; the chips
 * carry the exact totals).
 */
export function pageLines(diff) {
  const d = diff?.pageChanges;
  if (!d) return [];
  const out = [];
  for (const b of d.added ?? []) out.push(`added ${blockName(b)}`);
  for (const b of d.removed ?? []) out.push(`removed ${blockName(b)}`);
  for (const b of d.moved ?? []) out.push(`${blockName(b)} ${moveWords(b)}`);
  for (const b of d.changed ?? []) out.push(`${blockName({ t: b.t, id: b.id })} “${short(b.before)}” → “${short(b.after)}”`);
  return out;
}

const TONES = {
  ok: 'bg-good/10 text-good',
  violated: 'bg-critical/10 text-critical',
  missing: 'bg-warn/10 text-warn',
  acknowledged: 'bg-warn/10 text-warn',
  paused: 'bg-ink/5 text-ink-3',
};
export const stateTone = (state) => TONES[state] ?? 'bg-ink/5 text-ink-2';

/** The pill on an incident card. `title` is there when the word needs a sentence. */
export function incidentPill(inc) {
  // A change on a judged clause was confirmed and Claude has been asked: not
  // yet a violation, not yet fine. Counted as unresolved until it is one.
  if (inc.status === 'judging') return { label: 'Judging…', tone: 'bg-brand-50 text-brand-2', title: 'Claude is deciding whether this change breaks the rule' };
  if (inc.status === 'open') {
    return inc.type === 'missing' ? { label: 'missing', tone: 'bg-warn/10 text-warn' } : { label: 'open', tone: 'bg-critical/10 text-critical' };
  }
  return { label: inc.resolvedBy ? `resolved · ${inc.resolvedBy}` : 'resolved', tone: 'bg-ink/5 text-ink-2' };
}

const SEVERITY = { high: 'bg-critical/10 text-critical', medium: 'bg-warn/10 text-warn', low: 'bg-ink/5 text-ink-2' };
export const severityTone = (s) => SEVERITY[s] ?? 'bg-ink/5 text-ink-2';

/** Who wrote a verdict, as a chip. */
export function verdictSource(v) {
  if (!v) return null;
  if (v.source === 'claude') return { label: 'Claude', tone: 'info', title: v.model ?? '' };
  if (v.source === 'error') return { label: 'Claude failed · mock text', tone: 'warn', title: v.error ?? '' };
  return { label: 'mock judge', tone: 'neutral', title: 'A templated explanation — Claude judges when the runner has a key' };
}

const CHIP = {
  neutral: 'border-hairline text-ink-2',
  info: 'border-brand/20 bg-brand-50 text-brand-2',
  warn: 'border-warn/40 bg-warn/10 text-warn',
};
/** The class recipe for a chip's tone, on the base `rounded-full border px-2 py-0.5 text-[11.5px]`. */
export const chipTone = (tone) => CHIP[tone] ?? CHIP.neutral;

/** The badge in the top bar: which mind the runner has. */
/** The origin of a page's address, or null for something that is not one. */
export function originOfUrl(u) {
  try { return new URL(u).origin; } catch { return null; }
}

/**
 * The project a monitor belongs to, out of the suites this organisation has:
 * the one it was made from, or — made with no project chosen — the one whose
 * origin its page is on. Null when neither. The runner draws the same line
 * (monitor.js belongs), so a count here and a count there agree.
 */
export function projectOf(m, suites) {
  if (!m || !Array.isArray(suites)) return null;
  if (m.suiteId) return suites.find((s) => s.id === m.suiteId) ?? null;
  const origin = originOfUrl(m.url);
  return origin ? suites.find((s) => originOfUrl(s.origin ?? s.baseUrl) === origin) ?? null : null;
}

export function llmBadge(summary) {
  const llm = summary?.llm;
  if (!llm) return null;
  if (llm.mode === 'claude') return { label: `Claude · ${llm.model}`, title: `Rules are compiled and incidents judged by ${llm.model}`, claude: true };
  return {
    label: 'Mock compiler',
    title: llm.key?.have ? 'GC_MONITOR_LLM=mock — the deterministic compiler and judge' : 'No API key on the runner — the deterministic compiler and judge',
    claude: false,
  };
}
