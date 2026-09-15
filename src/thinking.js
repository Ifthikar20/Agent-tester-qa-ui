/**
 * The runner, thinking out loud: the quiet line under a step while an AI fix is
 * being worked out.
 *
 * A consult takes seconds — the page is read, a model is asked, the answer is
 * checked against the page before anything is pressed — and a running step that
 * sits unchanged for eight seconds reads as a runner that has hung. So the
 * runner says which of those it is doing, as step.thinking, and the step's row
 * says it back with a clock.
 *
 * PURE, like fixes.js: no Vue, no store. The store keeps the state on the live
 * step and the console draws it; the rules for when it starts, changes and ends
 * live here, once, where a test can hold them.
 *
 * What the line may say is the runner's short fixed phrase, never page content
 * — the contract says so, and the length cap below is only a backstop for a
 * runner that forgets: a sentence that long is not a status, whatever it is.
 */

/** The phases in the order a consult goes through them. `done` ends it. */
export const PHASES = ['reading', 'deciding', 'checking', 'done'];

/**
 * What each phase says when the runner sends no words of its own. The runner's
 * text wins — for a position check `deciding` is "Checking this is the element
 * you recorded…", which only the runner knows.
 */
export const PHASE_TEXT = {
  reading: 'Reading the page…',
  deciding: 'Working out what changed…',
  checking: 'Checking the fix…',
};

const MAX_TEXT = 80;

/**
 * A step with the thinking event applied — a new object, the store's steps are
 * replaced rather than mutated.
 *
 * `since` is when this consult STARTED, and is kept across its phases: the clock
 * says how long the runner has been at it, and one that went back to 0s when
 * reading turned into deciding would under-report exactly the wait it is there
 * to explain. `done`, an unknown phase, or a step that is not there ends it.
 */
export function applyThinking(step, ev, now = Date.now()) {
  if (!step) return step;
  const phase = ev?.phase;
  if (phase === 'done' || !PHASE_TEXT[phase]) return endThinking(step);
  const said = typeof ev.text === 'string' ? ev.text.trim() : '';
  const text = said ? (said.length > MAX_TEXT ? `${said.slice(0, MAX_TEXT - 1)}…` : said) : PHASE_TEXT[phase];
  const since = step.thinking?.since ?? now;
  return { ...step, thinking: { phase, text, since } };
}

/**
 * The step with no thinking state. step.pass, step.fail and run.end all call
 * this — a runner that never sent `done` (a dropped socket, an old runner) must
 * not leave a row saying it is still working on a step that has a verdict.
 * The same object when there was nothing to clear, so a store replacing every
 * step on run.end does not re-render the ones that were quiet.
 */
export function endThinking(step) {
  if (!step || !step.thinking) return step;
  return { ...step, thinking: null };
}

/**
 * `3s` — how long the runner has been thinking. Empty for the first second: a
 * clock that says 0s is noise, and a consult that answers inside a second has
 * no wait to explain.
 */
export function elapsedLabel(since, now = Date.now()) {
  if (typeof since !== 'number' || !Number.isFinite(since)) return '';
  const s = Math.floor((now - since) / 1000);
  return s >= 1 ? `${s}s` : '';
}

/**
 * A live step after any runner event, as far as its thinking goes — the one
 * rule the store follows for every event, so a test holds what the store does
 * and not a copy of it: step.thinking applies, a verdict (step.pass,
 * step.fail) or run.end ends it, and anything else leaves the step alone.
 */
export function thinkingOn(step, ev, now = Date.now()) {
  if (!step || !ev) return step;
  if (ev.t === 'step.thinking') return applyThinking(step, ev, now);
  if (ev.t === 'step.pass' || ev.t === 'step.fail' || ev.t === 'run.end') return endThinking(step);
  return step;
}

/** Is any step of this run waiting on the runner's thinking? The console's clock runs only then. */
export const anyThinking = (steps) => (steps ?? []).some((s) => !!s?.thinking);
