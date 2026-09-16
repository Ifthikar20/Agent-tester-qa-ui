/**
 * Defects, as this app reads them: the number, the words for each state, and
 * the search over them.
 *
 * The runner decides all of it (the backend's defects.js) — which failures are
 * one defect, which number each gets, when one closes — and this only reads
 * the answer. Pure, so `npm test` can hold the search to what a person typing
 * into it expects: a number, however it is typed, finds that defect and
 * nothing else, whatever the filters say.
 */

/**
 * Any way a person might type a number, as the number: DEF-2609-007,
 * def-2609-7, 2609-007, #2609-7 and 2609007 are all DEF-2609-007. The same
 * reading the runner makes of a number in a URL.
 */
export function canonicalId(input) {
  const m = String(input ?? '').trim().match(/^#?(?:def[-_\s]*)?(\d{2})(0[1-9]|1[0-2])[-_\s]*(\d{1,6})$/i);
  if (!m || Number(m[3]) === 0) return null;
  return `DEF-${m[1]}${m[2]}-${String(Number(m[3])).padStart(3, '0')}`;
}

/** Each status, and the sentence that says what it means. */
export const STATUSES = {
  open:        { label: 'Open',        means: 'Failing, and no affected case has passed since' },
  reopened:    { label: 'Reopened',    means: 'Failing again after an affected case had passed' },
  known_issue: { label: 'Known issue', means: 'Failing, and someone has marked it as known' },
  wont_fix:    { label: "Won't fix",   means: 'Failing, and someone has decided to leave it' },
  closed:      { label: 'Closed',      means: 'An affected case has passed since it last failed' },
};

export const SEVERITIES = { critical: 'Critical', major: 'Major', minor: 'Minor', trivial: 'Trivial' };
/** Worst first. */
export const SEVERITY_ORDER = ['critical', 'major', 'minor', 'trivial'];

/** The views across the top of the list, each a set of statuses; `all` is every one. */
export const VIEWS = [
  { key: 'open',     label: 'Open',                    statuses: ['open', 'reopened'] },
  { key: 'reopened', label: 'Reopened',                statuses: ['reopened'] },
  { key: 'parked',   label: "Known issue & won't fix", statuses: ['known_issue', 'wont_fix'] },
  { key: 'closed',   label: 'Closed',                  statuses: ['closed'] },
  { key: 'all',      label: 'Everything',              statuses: null },
];

const HOUR = 3_600_000;
export const SEEN = {
  '24h': { label: 'Seen in 24 hours', ms: 24 * HOUR },
  '7d':  { label: 'Seen in 7 days',   ms: 7 * 24 * HOUR },
  '30d': { label: 'Seen in 30 days',  ms: 30 * 24 * HOUR },
};

const RANK = { trivial: 0, minor: 1, major: 2, critical: 3 };
const STATUS_RANK = { closed: 0, wont_fix: 1, known_issue: 2, open: 3, reopened: 4 };
/** Each compares ascending; a leading "-" in the query turns it round. */
const SORTS = {
  id: (a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }),
  created: (a, b) => a.firstSeen - b.firstSeen,
  seen: (a, b) => a.lastSeen - b.lastSeen,
  status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
  severity: (a, b) => RANK[a.severity] - RANK[b.severity],
  hits: (a, b) => a.hits - b.hits,
};

export const DEFAULTS = { view: 'open', q: '', severity: '', assignee: '', suite: '', seen: '', sort: '-seen' };

const one = (v) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * The filters in a route's query. Anything not recognised is its default, so a
 * link that has been mangled on its way through a chat still opens a list.
 */
export function filtersFrom(query = {}) {
  const f = { ...DEFAULTS };
  const view = one(query.view);
  if (VIEWS.some((v) => v.key === view)) f.view = view;
  f.q = String(one(query.q)).slice(0, 200);
  const severity = one(query.severity);
  if (SEVERITIES[severity]) f.severity = severity;
  f.assignee = String(one(query.assignee)).slice(0, 254);
  f.suite = String(one(query.suite)).slice(0, 200);
  const seen = one(query.seen);
  if (SEEN[seen]) f.seen = seen;
  const sort = String(one(query.sort));
  if (SORTS[sort.replace(/^-/, '')]) f.sort = sort;
  return f;
}

/** The query for a set of filters, defaults left out so a plain list stays a plain /defects. */
export function queryFrom(filters) {
  const query = {};
  for (const [k, v] of Object.entries(filters)) if (k in DEFAULTS && v && v !== DEFAULTS[k]) query[k] = v;
  return query;
}

/** The key a person is filtered by: their email, or their name where there is no email. */
export const personKey = (p) => String(p?.email || p?.name || '').toLowerCase();
export const suiteKey = (s) => s.id ?? `name:${s.name}`;

/**
 * Whether a defect answers a search: every word somewhere in its number, its
 * sentence, the step that failed, its cases, its suites, its site or its assignee.
 */
export function matches(d, q) {
  const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [d.id, d.title, d.target, d.origin, d.url, d.assignee?.name, d.assignee?.email,
    ...(d.cases ?? []).map((c) => c.name), ...(d.suites ?? []).map((s) => s.name)]
    .filter(Boolean).join('\n').toLowerCase();
  return words.every((w) => hay.includes(w));
}

function assigned(d, want, me) {
  if (!want) return true;
  if (want === 'none') return !d.assignee;
  if (!d.assignee) return false;
  if (want === 'me') {
    if (!me) return false;
    return d.assignee.id != null && me.id != null
      ? String(d.assignee.id) === String(me.id)
      : personKey(d.assignee) === personKey(me);
  }
  return personKey(d.assignee) === want.toLowerCase();
}

/**
 * The defects a set of filters leaves.
 *
 * A number typed in full is a lookup rather than a filter: it finds that
 * defect whatever the view and the other filters say, because someone pasting
 * DEF-2609-007 from a ticket wants DEF-2609-007, not an empty "Open" list
 * because it has closed since.
 *
 * @param me the signed-in person, for "assigned to me"
 */
export function applyFilters(list, f, { me = null, now = Date.now() } = {}) {
  const id = canonicalId(f.q);
  if (id) return list.filter((d) => d.id === id);
  const statuses = VIEWS.find((v) => v.key === f.view)?.statuses ?? null;
  const since = SEEN[f.seen] ? now - SEEN[f.seen].ms : null;
  return list.filter((d) => (!statuses || statuses.includes(d.status))
    && (!f.severity || d.severity === f.severity)
    && (!f.suite || (d.suites ?? []).some((s) => suiteKey(s) === f.suite))
    && assigned(d, f.assignee, me)
    && (since === null || d.lastSeen >= since)
    && matches(d, f.q));
}

/** Sorted by a query's `sort`, the most recently seen breaking a tie. */
export function sortDefects(list, sort = DEFAULTS.sort) {
  const desc = String(sort).startsWith('-');
  const by = SORTS[String(sort).replace(/^-/, '')] ?? SORTS.seen;
  return list.slice().sort((a, b) => (desc ? by(b, a) : by(a, b)) || b.lastSeen - a.lastSeen);
}

/** How many defects each view holds, for the counts beside their names. */
export function countViews(list) {
  return Object.fromEntries(VIEWS.map((v) => [v.key,
    v.statuses ? list.filter((d) => v.statuses.includes(d.status)).length : list.length]));
}

/** Every suite the defects name, once, for the suite filter. */
export function suitesIn(list) {
  const found = new Map();
  for (const d of list) for (const s of d.suites ?? []) found.set(suiteKey(s), s.name);
  return [...found].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Everyone a defect is assigned to, once, for the assignee filter. */
export function assigneesIn(list) {
  const found = new Map();
  for (const d of list) if (d.assignee) found.set(personKey(d.assignee), d.assignee.name || d.assignee.email);
  return [...found].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Where a defect happens, on one line: the suite and first case, and how many more. */
export function whereOf(d) {
  const cases = d.cases ?? [];
  const first = cases[0];
  const suite = first?.suite ?? d.suites?.[0]?.name ?? '';
  const name = first ? (first.name ?? 'a script run from the console') : '';
  const more = cases.length > 1 ? ` · +${cases.length - 1} more case${cases.length === 2 ? '' : 's'}` : '';
  return [suite, name].filter(Boolean).join(' · ') + more;
}

const nameOf = (a) => a?.name || a?.email || 'someone';

/** One entry of a defect's activity, as a sentence. `by` null is the application. */
export function activityLine(ev) {
  const who = ev.by == null ? 'ghostclick' : ev.by.email || 'Someone on this runner';
  switch (ev.kind) {
    case 'filed': return `Filed by ghostclick: ${ev.text}`;
    case 'closed': return `Closed by ghostclick: ${ev.text}`;
    case 'reopened': return `Reopened by ghostclick: ${ev.text}`;
    case 'severity': return ev.to ? `${who} set the severity to ${SEVERITIES[ev.to] ?? ev.to}` : `${who} gave the severity back to ghostclick`;
    case 'resolution': return ev.to
      ? `${who} marked it ${STATUSES[ev.to]?.label ?? ev.to}`
      : `${who} put it back to be tracked (it was ${STATUSES[ev.from]?.label ?? ev.from})`;
    case 'assignee': return ev.to ? `${who} assigned it to ${nameOf(ev.to)}` : `${who} unassigned ${nameOf(ev.from)}`;
    default: return `${who}: ${ev.kind}`;
  }
}
