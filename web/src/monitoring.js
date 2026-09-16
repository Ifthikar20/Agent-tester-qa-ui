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
 * fontSize, width, height, rowCount, textLength, childElementCount }`.
 */

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

/** `16px · 640×48 · 5 rows · visible` — a monitor's live numbers, in one line. */
export function metricsLine(m) {
  if (!m) return 'no measurement yet';
  if (m.exists === false) return 'element missing';
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
    case 'unchanged': return `${c.metric} unchanged`;
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
  if (m.specError) out.push({ text: 'mock fallback', tone: 'warn', title: m.specError });
  if (m.spec?.needsLlmJudgment) out.push({ text: 'needs judgment', tone: 'warn', title: m.spec.judgmentHint ?? '' });
  return out;
}

/** `fontSize: 16 → 36`, one per metric that moved. */
export function diffChips(diff) {
  return Object.entries(diff ?? {}).map(([k, v]) => (k === 'htmlChanged' ? 'markup changed' : Array.isArray(v) ? `${k}: ${v[0]} → ${v[1]}` : `${k}: ${v}`));
}

const TONES = {
  ok: 'bg-good/10 text-good',
  violated: 'bg-critical/10 text-critical',
  missing: 'bg-warn/10 text-warn',
  acknowledged: 'bg-warn/10 text-warn',
  paused: 'bg-ink/5 text-ink-3',
};
export const stateTone = (state) => TONES[state] ?? 'bg-ink/5 text-ink-2';

/** The pill on an incident card. */
export function incidentPill(inc) {
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
