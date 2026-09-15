/**
 * Automatic fixes, as a person reads them.
 *
 * A replay that needed help to pass is not the same thing as a clean pass, and
 * it is not a failure either: the page moved — a cookie banner arrived, a field
 * was renamed, a button went behind a menu — and the runner found its way
 * through. Every screen that shows a run has to be able to say that without
 * inventing its own words for it, which is how the console ends up calling a
 * thing "healed" while the runs table calls it "passed" and the case page calls
 * it "changed". So the words live here, once.
 *
 * PURE, like readflow.js: no Vue, no store, no fetch. The shapes are the
 * backend's (the fix and the Suggestion in the heal contract) and nothing here
 * decides whether a fix is right — it only says what one did.
 *
 * `from` and `insert` arrive as lines of the case language and `to` as a bare
 * target (`'Account' : button`). Showing `to` on its own would make a person
 * reassemble the step in their head — and for a fill, remember the value that
 * is not in it — so `replacement` writes the whole step back through the same
 * vocabulary the runner parses with. A line the vocabulary cannot read is still
 * shown, never dropped: the runner is the authority on what runs, not this.
 */
import { parseAction, showAction, target as parseTarget } from './lang/vocabulary.js';

/** What each kind of fix did, short enough for a mark and a list heading. */
export const KIND_LABELS = {
  waited: 'Waited for the page',
  closed_popup: 'Closed a popup',
  opened_menu: 'Opened a menu first',
  same_field: 'Same field, new name',
  used_element: 'Used another element',
  moved: 'Updated position',
};

export const kindLabel = (kind) => KIND_LABELS[kind] ?? 'Fixed';

/**
 * Who decided. A rule is the runner's own reasoning about the page and makes no
 * call anywhere; an AI fix is a model's answer, which is why only those carry a
 * reason and a confidence.
 */
export const tierLabel = (tier) => (tier === 'ai' ? 'AI fix' : 'Safe fix');

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** `Passed with 2 fixes`, or just `Passed` when nothing needed mending. */
export const passedWith = (n) => (n > 0 ? `Passed with ${plural(n, 'fix', 'fixes')}` : 'Passed');

/**
 * `82% sure`, from 0.82. A model that says 82 instead of 0.82 is read the same
 * way rather than printed as 8200%, and anything that is not a finite number
 * says nothing at all — a confidence nobody gave is not zero.
 */
export function confidenceLabel(c) {
  if (typeof c !== 'number' || !Number.isFinite(c)) return null;
  const pct = Math.round(Math.max(0, Math.min(c <= 1 ? c * 100 : c, 100)));
  return `${pct}% sure`;
}

/** `seen once`, `seen 4 times` — how often a saved case needed the same help. */
export const seenLabel = (n) => (!n || n <= 1 ? 'seen once' : `seen ${n} times`);

/**
 * The step as it will be written once the fix is accepted: `from` with its
 * target swapped for `to`. Null when the target did not change.
 *
 * Through the vocabulary, so a fill keeps its value — `$PASSWORD` stays a vault
 * reference and is never expanded here. When `from` will not parse, the op and
 * the new target are still a truthful line, and better than nothing.
 */
export function replacement(fix) {
  if (!fix?.to) return null;
  try {
    const step = parseAction(fix.from);
    if (step && 'target' in step) return showAction({ ...step, target: parseTarget(fix.to) });
  } catch { /* an unreadable line: fall through to the plain form */ }
  return `${fix.op ?? 'click'} ${fix.to}`;
}

/**
 * A position as a person reads it: `412,300`. Whole pixels — the runner records
 * whole pixels, and a box read back as 412.5 is the same place. Null for
 * anything that is not a pair of finite numbers, so a missing `at` says nothing
 * rather than `NaN,NaN`.
 */
export function positionText(at) {
  const x = Number(at?.x), y = Number(at?.y);
  if (at == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return `${Math.round(x)},${Math.round(y)}`;
}

/**
 * Where a case recorded step `step` landing: its `%% at N x,y wxh in vwxvh` line
 * (flow.js toFlow), as the same `{ x, y, w, h, vw, vh }` a step carries. Null
 * when the case has no mark for that step.
 *
 * Needed because a `moved` fix carries only where the element is NOW. The
 * recorded point is evidence the case already holds, and a suggestion that said
 * "move it to 412,340" without saying from where would ask a person to open the
 * flow and find the comment themselves. `step` is the run's index, which is the
 * index the mark was written with — both count the case's flattened steps.
 */
export function recordedAt(flow, step) {
  if (typeof flow !== 'string' || !Number.isInteger(step)) return null;
  const re = /^%%\s*at\s+(\d+)\s+(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)\s+in\s+(\d+)x(\d+)\s*$/;
  for (const raw of flow.split('\n')) {
    const m = re.exec(raw.trim());
    if (m && Number(m[1]) === step) {
      const [x, y, w, h, vw, vh] = m.slice(2).map(Number);
      return { x, y, w, h, vw, vh };
    }
  }
  return null;
}

/**
 * `412,300 → 412,340`, or just `412,340` when where it was recorded is not
 * known — the new position is the fix, and still true on its own.
 */
export function positionChange(fix, was) {
  const to = positionText(fix?.at);
  if (!to) return null;
  const from = positionText(was);
  return from ? `${from} → ${to}` : to;
}

/** The suggestion as one sentence: `Update recorded position: 412,300 → 412,340`. Null for any other kind. */
export function positionLine(fix, was) {
  if (fix?.kind !== 'moved') return null;
  const change = positionChange(fix, was);
  return change ? `Update recorded position: ${change}` : null;
}

/**
 * The lines a fix is drawn as, in reading order: the step that was recorded,
 * then what changes. An inserted step comes BEFORE the recorded one when it
 * runs, but it is read after it — you have to know which step it is for first.
 *
 *   [{ role: 'from', label: 'Recorded', text }, { role: 'insert', label: 'Insert before it', text }, …]
 *
 * A `moved` fix changes no step at all, only the landing point recorded beside
 * it, so its second line is the position (`role: 'at'`). `was` is that recorded
 * point when the caller has it — the running step's `at` in the console, the
 * case's `%% at` mark on the Cases page (recordedAt).
 */
export function fixLines(fix, { was = null } = {}) {
  if (!fix) return [];
  const lines = [{ role: 'from', label: 'Recorded', text: fix.from ?? '' }];
  if (fix.insert) lines.push({ role: 'insert', label: 'Insert before it', text: fix.insert });
  const to = replacement(fix);
  if (to) lines.push({ role: 'to', label: 'Replace with', text: to });
  if (fix.kind === 'moved') {
    const change = positionChange(fix, was);
    if (change) lines.push({ role: 'at', label: 'Update recorded position', text: change });
  }
  return lines;
}

/**
 * The hover line for an AI fix: its reason and how sure it was. Null for a rule,
 * which has no reason beyond its note.
 */
export function whyLine(fix) {
  if (!fix || fix.tier !== 'ai') return null;
  const parts = [fix.reason, confidenceLabel(fix.confidence)].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Two reports of one fix — step.heal, then the same fix on step.pass — are one fix. */
const sameFix = (a, b) => a.kind === b.kind && a.step === b.step && a.from === b.from
  && (a.to ?? null) === (b.to ?? null) && (a.insert ?? null) === (b.insert ?? null);

/** A fix added to a step's list, unless that step already has it. */
export function addFix(list, fix) {
  const have = Array.isArray(list) ? list : [];
  if (!fix || have.some((f) => sameFix(f, fix))) return have;
  return [...have, fix];
}

/** Fixes across a run's steps — while it is still going, before run.end counts them. */
export const countFixes = (steps) => (steps ?? []).reduce((n, s) => n + (s?.fixes?.length ?? 0), 0);

/**
 * One row of run history, as a verdict: 'fixed' is a pass that needed help,
 * which the tables draw differently from a clean one. A failure is a failure
 * however many fixes came before the step that stopped it.
 */
export const runVerdict = (r) => (!r?.ok ? 'fail' : (r.fixed ?? 0) > 0 ? 'fixed' : 'pass');

/**
 * A history row's fixes as a tooltip: one note per line, and how many the row
 * did not carry — the runs list keeps at most twenty per run. Undefined when
 * there is nothing to say, so Vue leaves the attribute off.
 */
export function fixesTitle(r) {
  const notes = (r?.fixes ?? []).map((f) => f?.note).filter(Boolean);
  const total = typeof r?.fixed === 'number' ? r.fixed : notes.length;
  if (!notes.length) return total > 0 ? passedWith(total) : undefined;
  const more = total - notes.length;
  return [...notes, ...(more > 0 ? [`and ${more} more`] : [])].join('\n');
}

/**
 * A suggestion's timestamp as epoch milliseconds. The runner sends ISO strings
 * (`2026-09-14T08:08:00.000Z`); arithmetic on one of those is NaN, which read
 * "last NaN d ago" and left the order of suggestions to chance. A number is
 * taken as it is, and anything unreadable is 0 — the oldest there is.
 */
export function timeOf(t) {
  if (typeof t === 'number') return Number.isFinite(t) ? t : 0;
  const ms = Date.parse(String(t ?? ''));
  return Number.isFinite(ms) ? ms : 0;
}

/** Did any of these fixes become a suggestion someone can accept? */
export const anySaved = (steps) => (steps ?? []).some((s) => (s?.fixes ?? []).some((f) => f?.saved === true));

/**
 * Pending suggestions, by case — newest-seen first inside each, and cases in
 * the order their most recent suggestion was seen. Keyed by suite as well as
 * case, because a case id is only unique inside its suite.
 */
export function groupByCase(suggestions) {
  const by = new Map();
  for (const s of suggestions ?? []) {
    const key = `${s.suiteId}/${s.caseId}`;
    if (!by.has(key)) by.set(key, { key, suiteId: s.suiteId, caseId: s.caseId, caseName: s.caseName ?? null, fixes: [] });
    by.get(key).fixes.push(s);
  }
  const seen = (s) => timeOf(s.lastSeenAt ?? s.createdAt ?? 0);
  return [...by.values()]
    .map((g) => ({ ...g, fixes: g.fixes.sort((a, b) => seen(b) - seen(a)) }))
    .sort((a, b) => seen(b.fixes[0]) - seen(a.fixes[0]));
}

/** `{ caseId: [suggestion, …] }` for one suite — what a list of cases looks up. */
export function forSuite(suggestions, suiteId) {
  const out = {};
  for (const g of groupByCase(suggestions)) if (g.suiteId === suiteId) out[g.caseId] = g.fixes;
  return out;
}

/**
 * The heal state, as the console's quiet chip says it.
 *
 * The deployment's mode being 'ai' is not the same as AI fixes being on for
 * THIS organisation: that also needs the key, the operator's switch, and the
 * organisation to have opted in. Short of all of them, the runner still makes
 * the safe fixes — so that is what the chip says, not "AI fixes on".
 */
export function modeLabel(heal) {
  if (!heal || heal.mode === 'off') return 'Automatic fixes off';
  if (heal.mode === 'ai' && heal.ai?.available && heal.ai?.enabled) return 'AI fixes on';
  return 'Safe fixes on';
}

/** The reason under the chip, for a pointer. */
export function modeDetail(heal) {
  if (!heal || heal.mode === 'off') return 'A step that breaks fails as recorded. Nothing is changed for you.';
  const safe = 'Waits, closes popups and finds renamed fields by rule when a step breaks, and says so on the step.';
  if (heal.mode === 'ai' && heal.ai?.available && heal.ai?.enabled) {
    return `${safe} When no rule mends it, a snapshot of the page’s structure is sent to the AI, with typed values and secrets removed.`;
  }
  return safe;
}

/**
 * Why the organisation's AI toggle cannot be changed right now — or null when
 * it can. `organisation` is not a reason to disable it: it only means nobody has
 * opted in yet, and opting in is what the toggle is for.
 */
export function aiLockedReason(heal) {
  if (!heal) return 'Loading…';
  const why = {
    deployment: 'This deployment does not run AI fixes.',
    switch: 'The operator has turned AI fixes off on this deployment.',
    key: 'No AI key is configured on this deployment.',
  }[heal.ai?.available ? null : heal.ai?.reason];
  if (why) return why;
  if (!heal.ai?.available) return 'AI fixes are not available on this deployment.';
  if (!heal.canManage) return 'Only an owner or admin of this organisation can change this.';
  return null;
}
