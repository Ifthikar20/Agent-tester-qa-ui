/**
 * Defects — the pure half of the page.
 *
 * The runner numbers, files and closes defects (its defects.js); this is how
 * one reads on a row and in the drawer, with no store and no DOM in sight.
 * The page is drawn the way the good issue trackers draw theirs — a dense
 * list, the severity as a shape and a word before a colour, the number a
 * person can say out loud, filters that are one press each, and the whole
 * story of one defect in a panel beside the list rather than on a page of
 * its own — because that is what a person triaging thirty of them needs.
 *
 * A defect (the runner's `view`): { id, kind: 'run' | 'monitor', title,
 * target, origin, url, step, firstSeen, lastSeen, hits, reopened, closedAt,
 * cases, suites, status, severity, autoSeverity, severityBy, assignee,
 * reporter, updatedAt, monitor, evidence }.
 */

export const SEVERITIES = ['critical', 'major', 'minor', 'trivial'];
export const STATUSES = ['open', 'reopened', 'known_issue', 'wont_fix', 'closed'];
export const STATUS_LABEL = { open: 'Open', reopened: 'Reopened', known_issue: 'Known issue', wont_fix: 'Won’t fix', closed: 'Closed' };
/** Standing: failing right now and not parked — what "open" means on the page. */
export const isStanding = (s) => s === 'open' || s === 'reopened';
export const isParked = (s) => s === 'known_issue' || s === 'wont_fix';

/** The one-press filters above the list. */
export const STATUS_FILTERS = [
  { key: 'standing', label: 'Open', title: 'Failing now: open and reopened' },
  { key: 'parked', label: 'Parked', title: 'Known issues and won’t-fix' },
  { key: 'closed', label: 'Closed', title: 'Passing again' },
  { key: 'all', label: 'All', title: 'Everything the runner has kept' },
];
export const SOURCES = [
  { key: 'all', label: 'Any source' },
  { key: 'run', label: 'Runs' },
  { key: 'monitor', label: 'Monitors' },
];
export const SORTS = [
  { key: 'recent', label: 'Last seen' },
  { key: 'severity', label: 'Severity' },
  { key: 'hits', label: 'Most hits' },
  { key: 'newest', label: 'Newest' },
];

export function matchesStatus(d, key) {
  if (key === 'all') return true;
  if (key === 'standing') return isStanding(d.status);
  if (key === 'parked') return isParked(d.status);
  return d.status === 'closed';
}

/**
 * The severity as a shape and a word, then a colour: critical and major
 * are filled, minor is outlined, trivial is dotted — so a reader who cannot
 * tell the red from the amber still tells them apart.
 */
const SEVERITY_LOOK = {
  critical: { label: 'critical', text: 'text-critical', swatch: 'bg-critical', rank: 0 },
  major: { label: 'major', text: 'text-warn', swatch: 'bg-warn', rank: 1 },
  minor: { label: 'minor', text: 'text-ink-2', swatch: 'border-[1.5px] border-ink-2', rank: 2 },
  trivial: { label: 'trivial', text: 'text-ink-3', swatch: 'border border-dashed border-ink-3', rank: 3 },
};
export const severityLook = (s) => SEVERITY_LOOK[s] ?? { label: s ?? 'unrated', text: 'text-ink-3', swatch: 'border border-ink-3', rank: 4 };

/** The pill for a status: what is failing wears the colour, what is settled does not. */
const STATUS_PILL = {
  open: { label: 'Open', tone: 'bg-critical/10 text-critical' },
  reopened: { label: 'Reopened', tone: 'bg-warn/10 text-warn' },
  known_issue: { label: 'Known issue', tone: 'bg-ink/5 text-ink-2' },
  wont_fix: { label: 'Won’t fix', tone: 'bg-ink/5 text-ink-2' },
  closed: { label: 'Closed', tone: 'bg-good/10 text-good' },
};
export const statusPill = (s) => STATUS_PILL[s] ?? { label: STATUS_LABEL[s] ?? s, tone: 'bg-ink/5 text-ink-2' };

/** Where it came from: a run, or a monitor watching a page. */
export const sourceOf = (d) => (d.kind === 'monitor'
  ? { key: 'monitor', label: 'monitor', icon: 'monitor', title: 'Found by a monitor: a rule about a page broke' }
  : { key: 'run', label: 'run', icon: 'play', title: 'Found by a run: a case stopped on this' });

export const pathOf = (url) => {
  try { const u = new URL(url); return (u.pathname || '/') + u.search; } catch { return url || ''; }
};
export const hostOf = (url) => {
  try { return new URL(url).host; } catch { return ''; }
};

/** `Shop · 4 cases` for a run's defect, `Hero copy · /pricing` for a monitor's. */
export function whereOf(d) {
  if (d.kind === 'monitor') {
    const parts = [d.monitor?.label ?? 'a monitor'];
    const p = pathOf(d.monitor?.page ?? d.url);
    if (p) parts.push(p);
    return parts.join(' · ');
  }
  const suites = (d.suites ?? []).map((s) => s.name).filter(Boolean);
  const n = d.cases?.length ?? 0;
  const parts = [];
  if (suites.length) parts.push(suites.slice(0, 2).join(', ') + (suites.length > 2 ? ` +${suites.length - 2}` : ''));
  if (n) parts.push(`${n} case${n === 1 ? '' : 's'}`);
  if (!parts.length && d.origin) parts.push(hostOf(d.origin));
  return parts.join(' · ') || 'a run';
}

/** `MO` for Monica, `QA` for qa@shop.example — the badge on a row. */
export function initialsOf(a) {
  if (!a) return '';
  const name = String(a.name ?? '').trim();
  if (name) {
    const bits = name.split(/\s+/).filter(Boolean);
    return (bits.length > 1 ? bits[0][0] + bits[bits.length - 1][0] : name.slice(0, 2)).toUpperCase();
  }
  return String(a.email ?? '').slice(0, 2).toUpperCase();
}
export const assigneeName = (a) => (a ? (a.name || a.email || 'someone') : '');

/** Who wrote an activity line: the runner, or the person's name or address. */
export const whoOf = (by) => (!by ? 'ghostclick' : (by.name || by.email || by.sub || 'someone'));

/** The words a search box matches: the number, the sentence, where, who. */
const haystack = (d) => [
  d.id, d.title, d.target, d.origin, d.url, d.status, d.severity, d.kind,
  ...(d.suites ?? []).map((s) => s.name), ...(d.cases ?? []).map((c) => c.name),
  d.monitor?.label, d.monitor?.ruleText, assigneeName(d.assignee),
].filter(Boolean).join(' ').toLowerCase();

export function search(rows, q) {
  const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((d) => { const h = haystack(d); return words.every((w) => h.includes(w)); });
}

export function sortRows(rows, key) {
  const out = rows.slice();
  const bySeverity = (a, b) => severityLook(a.severity).rank - severityLook(b.severity).rank || b.lastSeen - a.lastSeen;
  switch (key) {
    case 'severity': return out.sort(bySeverity);
    case 'hits': return out.sort((a, b) => (b.hits ?? 0) - (a.hits ?? 0) || b.lastSeen - a.lastSeen);
    case 'newest': return out.sort((a, b) => b.firstSeen - a.firstSeen);
    default: return out.sort((a, b) => b.lastSeen - a.lastSeen);
  }
}

/** Filter, search and sort, in one place, so the count and the rows agree. */
export function selectRows(list, { status = 'standing', source = 'all', severities = [], q = '', sort = 'recent' } = {}) {
  let rows = (list ?? []).filter((d) => matchesStatus(d, status));
  if (source !== 'all') rows = rows.filter((d) => (d.kind ?? 'run') === source);
  if (severities.length) rows = rows.filter((d) => severities.includes(d.severity));
  return sortRows(search(rows, q), sort);
}

const WEEK = 7 * 86_400_000;
/** The four numbers above the list. */
export function tilesOf(list, totals, now = Date.now()) {
  const all = list ?? [];
  const standing = all.filter((d) => isStanding(d.status));
  return {
    open: standing.length,
    unassigned: totals?.unassigned ?? standing.filter((d) => !d.assignee).length,
    urgent: standing.filter((d) => d.severity === 'critical' || d.severity === 'major').length,
    critical: standing.filter((d) => d.severity === 'critical').length,
    monitors: totals?.monitors ?? standing.filter((d) => d.kind === 'monitor').length,
    closedWeek: all.filter((d) => d.closedAt && now - d.closedAt < WEEK).length,
    newWeek: all.filter((d) => now - d.firstSeen < WEEK).length,
  };
}

/** One activity entry as a line: a glyph, the sentence, who. */
const ACTIVITY = {
  filed: { icon: 'spark', tone: 'text-critical' },
  reopened: { icon: 'history', tone: 'text-warn' },
  closed: { icon: 'check', tone: 'text-good' },
  updated: { icon: 'list', tone: 'text-ink-2' },
  severity: { icon: 'defects', tone: 'text-ink-2' },
  assignee: { icon: 'org', tone: 'text-ink-2' },
  resolution: { icon: 'settings', tone: 'text-ink-2' },
};
const RES_WORD = { known_issue: 'a known issue', wont_fix: 'won’t fix', null: 'tracked again' };
export function activityLine(e) {
  const look = ACTIVITY[e.kind] ?? { icon: 'list', tone: 'text-ink-2' };
  let text = e.text ?? '';
  if (e.kind === 'severity') text = `severity ${e.from ?? 'the runner’s own'} → ${e.to ?? 'the runner’s own'}`;
  else if (e.kind === 'assignee') text = e.to ? `assigned to ${assigneeName(e.to)}` : `unassigned${e.from ? ` (was ${assigneeName(e.from)})` : ''}`;
  else if (e.kind === 'resolution') text = `parked as ${RES_WORD[e.to] ?? e.to}`.replace('parked as tracked again', 'tracked again');
  else if (e.kind === 'filed') text = `filed — ${text}`;
  else if (e.kind === 'closed') text = `closed — ${text}`;
  else if (e.kind === 'reopened') text = `reopened — ${text}`;
  return { ...look, text, who: whoOf(e.by), at: e.at };
}

/** `Stopped at step 3: open /cart`, or the rule a monitor watches. */
export function subtitleOf(d) {
  if (d.kind === 'monitor') return d.monitor?.ruleText ? `rule: “${d.monitor.ruleText}”` : 'a monitored page';
  const bits = [];
  if (d.step != null) bits.push(`stopped at step ${d.step + 1}`);
  if (d.target) bits.push(d.target);
  return bits.join(': ');
}
