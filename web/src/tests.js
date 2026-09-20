/**
 * How a test reads on a list and on its own page.
 *
 * The same argument as `defects.js`: the filtering, the search and the words
 * on a badge are decisions, and decisions in a template are decisions nobody
 * can check. Here they are pure functions over the payload
 * `GET /api/suites/:id/tests` returns, so the count above the list and the
 * rows in it cannot disagree, and a change to what "failing" means happens
 * once.
 *
 * The step KIND is the one thing worth arguing about. A run is a sequence of
 * things done and things checked, and those are not the same kind of sentence:
 * a check is the reason the test exists and everything else is the errand it
 * runs to get there. So the badge is derived from the IR — never stored, never
 * guessed — and it has four values, because that is how many the language
 * actually has (vocabulary.js VERBS):
 *
 *   Go     `goto`   — the one step that says where the browser goes
 *   Check  `expect` — an assertion; the test's verdict is made of these
 *   Wait   `wait`   — time, deliberately spent
 *   Act    the rest — click, fill, hover, press, tick, untick, choose, scroll
 *
 * There is no Screenshot kind, because there is no screenshot verb: a badge
 * for a step the runner cannot execute would be a promise the product does not
 * keep.
 */

/** A step's kind: the badge's word, and the colour it is drawn in. */
export function stepKind(step) {
  const op = step?.op;
  if (op === 'goto') return { key: 'go', label: 'Go', tone: 'text-series-1', wash: 'bg-series-1/10' };
  if (op === 'expect') return { key: 'check', label: 'Check', tone: 'text-good', wash: 'bg-good/10' };
  if (op === 'wait') return { key: 'wait', label: 'Wait', tone: 'text-ink-3', wash: 'bg-ink/[0.06]' };
  // A goal is a step written as an intention rather than as a move — the
  // agent works out the moves at run time (agent.js). It is an action, and it
  // is drawn as the brand's own colour because it is the one kind of step the
  // product itself decides.
  if (op === 'goal') return { key: 'goal', label: 'Goal', tone: 'text-brand-2', wash: 'bg-brand-50' };
  return { key: 'act', label: 'Act', tone: 'text-series-3', wash: 'bg-series-3/10' };
}

/** How many of each kind a test has — the line under its name on the detail page. */
export function kindCounts(steps) {
  const counts = { go: 0, act: 0, check: 0, wait: 0, goal: 0 };
  for (const s of steps ?? []) counts[stepKind(s).key]++;
  return counts;
}

/**
 * What a test's last run says on a row.
 *
 * "Never run" is not a failure and must not be drawn as one — most of a new
 * suite is never-run, and a column of red against tests nobody has tried yet
 * teaches people to ignore the colour.
 */
export function lastRunLook(lastRun, now = Date.now()) {
  if (!lastRun) return { text: 'Never run', tone: 'text-ink-3', state: 'never' };
  const ago = relative(lastRun.at, now) ?? 'at some point';
  return lastRun.ok
    ? { text: `Passed ${ago}`, tone: 'text-ink-3', state: 'pass' }
    : { text: `Failed ${ago}`, tone: 'text-critical', state: 'fail' };
}

/**
 * Relative time, in the words the rest of the product uses.
 *
 * `time.js when()` is the same idea and reads the clock itself, which a pure
 * function cannot do and a test of one should not have to. Same shapes, `now`
 * passed in.
 *
 * It takes epoch milliseconds OR an ISO string, because the payload it reads
 * carries both: a run's `at` is `Date.now()` (runs.js) and a case's
 * `updatedAt` is `new Date().toISOString()` (suites.js). Teaching one function
 * two shapes is better than every caller remembering which field is which —
 * that memory is how `NaNd ago` gets onto a page. A date it cannot read is
 * `null` rather than a guess, so a caller has something to say instead.
 */
export function relative(at, now = Date.now()) {
  const t = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const m = Math.round((now - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** Does this test match the word somebody typed — by name, or by what a step says. */
function matches(t, q, say) {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (t.name.toLowerCase().includes(needle)) return true;
  return (t.steps ?? []).some((s) => say(s).toLowerCase().includes(needle));
}

/** The status filter's four answers, over a test's last run. */
function isStatus(t, status) {
  switch (status) {
    case 'passing': return t.lastRun?.ok === true;
    case 'failing': return t.lastRun ? t.lastRun.ok === false : false;
    case 'never': return !t.lastRun;
    // A test whose document no longer parses is not passing, failing or
    // never-run: it cannot run at all, and it is the one state somebody has
    // to do something about.
    case 'broken': return Boolean(t.error);
    default: return true;
  }
}

export function sortTests(rows, key) {
  const out = rows.slice();
  switch (key) {
    case 'name': return out.sort((a, b) => a.name.localeCompare(b.name));
    case 'steps': return out.sort((a, b) => (b.steps?.length ?? 0) - (a.steps?.length ?? 0));
    // Never-run last, rather than first: a row with no date sorts as 0 and
    // would otherwise own the top of a "recently run" list.
    case 'run': return out.sort((a, b) => (b.lastRun?.at ?? -Infinity) - (a.lastRun?.at ?? -Infinity));
    default: return out.sort((a, b) => (b.updatedAt ? Date.parse(b.updatedAt) : 0) - (a.updatedAt ? Date.parse(a.updatedAt) : 0));
  }
}

/**
 * Filter, search and sort, in one place, so the count above the list and the
 * rows in it are the same answer.
 *
 * `say` is passed in rather than imported: the search reads what a step SAYS,
 * and the sentence comes from the vocabulary, which this module deliberately
 * does not depend on — a pure helper that imports the language is a pure
 * helper nobody can test without it.
 */
export function selectTests(list, { q = '', status = 'all', source = 'all', sort = 'recent' } = {}, say = () => '') {
  let rows = (list ?? []).filter((t) => isStatus(t, status));
  if (source !== 'all') rows = rows.filter((t) => (t.source ?? 'written') === source);
  return sortTests(rows.filter((t) => matches(t, q.trim(), say)), sort);
}

/** How many tests each status filter would show — the numbers on the pills. */
export function statusCounts(list) {
  const all = list ?? [];
  return {
    all: all.length,
    passing: all.filter((t) => isStatus(t, 'passing')).length,
    failing: all.filter((t) => isStatus(t, 'failing')).length,
    never: all.filter((t) => isStatus(t, 'never')).length,
    broken: all.filter((t) => isStatus(t, 'broken')).length,
  };
}
