/**
 * How a step was worked out, as a person reads it: the runner's trace.
 *
 * While an AI fix is being worked out, a step's row says which phase it is in
 * (thinking.js). The trace is what happened in it — what the runner saw, which
 * rules it tried, what the AI noticed, ruled out and decided, what the guards
 * checked, and what was done — one entry at a time as `step.trace`, and whole
 * again on the step's verdict. For a check that failed, it is the AI's answer
 * to why, and the one thing a tester could change.
 *
 * PURE, like fixes.js and thinking.js. The words in an entry are the runner's
 * and the model's, redacted where they were made; this module only orders,
 * labels and folds them, and the console draws them as text, never as markup.
 */
import { confidenceLabel } from './fixes.js';

/** Each kind of entry, as the short label beside it. */
export const KIND_LABELS = {
  saw: 'Saw', rule: 'Rule', asked: 'Asked AI', noticed: 'Noticed', ruled_out: 'Ruled out', decided: 'Decided',
  checked: 'Checked', did: 'Did', why: 'Why', advice: 'Try', note: 'Note',
};

/** What a failure looks like, in a word or two: the model's `failure`. */
export const FAILURE_LABELS = {
  app_bug: 'App bug', site_down: 'Site down', blocked_by_bot_check: 'Bot check', needs_login: 'Needs sign-in',
  missing_secret: 'Missing secret', wrong_start_page: 'Wrong start page', test_script: 'Test script', unknown: 'Unclear',
};

/** Entries one step keeps here. The runner keeps 32; this is the backstop for one that does not. */
export const MAX_ENTRIES = 40;

export const kindLabel = (kind) => KIND_LABELS[kind] ?? 'Note';
export const failureLabel = (failure) => FAILURE_LABELS[failure] ?? null;

/** Is this an entry the console can draw? */
export const isEntry = (e) => Boolean(e) && typeof e === 'object' && typeof e.kind === 'string' &&
  typeof e.text === 'string' && e.text.trim() !== '';

/** A step with one more entry — a new object, and never more than MAX_ENTRIES. */
export function addEntry(step, entry) {
  if (!step || !isEntry(entry)) return step;
  const have = Array.isArray(step.trace) ? step.trace : [];
  if (have.length >= MAX_ENTRIES) return step;
  return { ...step, trace: [...have, entry] };
}

/**
 * A live step after any runner event, as far as its trace goes — the store's
 * one rule for every event: step.trace adds an entry, and a verdict that
 * carries `trace` replaces the list with the runner's own, which wins over
 * entries a dropped socket may have lost. Anything else leaves the step alone.
 */
export function traceOn(step, ev) {
  if (!step || !ev) return step;
  if (ev.t === 'step.trace') return addEntry(step, ev.entry);
  if ((ev.t === 'step.pass' || ev.t === 'step.fail') && Array.isArray(ev.trace)) {
    return { ...step, trace: ev.trace.filter(isEntry).slice(0, MAX_ENTRIES) };
  }
  return step;
}

/** Did the AI take part? The heading says whose working it is. */
export const byAi = (trace) => (trace ?? []).some((e) => e?.tier === 'ai');

/** The heading over a step's trace. */
export const traceHeading = (trace) => (byAi(trace) ? 'How the AI worked it out' : 'What the runner tried');

/**
 * The one line a folded trace shows — the answer before the working: why it
 * failed, else what was decided and why, else what was done, else its last word.
 */
export function traceSummary(trace) {
  const list = (trace ?? []).filter(isEntry);
  const last = (kind) => [...list].reverse().find((e) => e.kind === kind);
  const why = last('why');
  if (why) return [failureLabel(why.failure), why.text].filter(Boolean).join(': ');
  const decided = last('decided');
  if (decided) return decided.detail ? `${decided.text} — ${decided.detail}` : decided.text;
  return (last('did') ?? list.at(-1))?.text ?? '';
}

/**
 * Is a step's trace shown open? A running step's is — it is being written —
 * and a failed step's, because it is the reason; a passed step's folds to its
 * one line. What a person chose, kept in `folds` by step index, wins.
 */
export function traceOpen(step, folds) {
  if (folds instanceof Map && folds.has(step?.i)) return folds.get(step.i) === true;
  return step?.state === 'run' || step?.state === 'fail';
}

/** The small labels beside an entry: what kind of failure it looks like, and how sure. */
export const entryChips = (e) => [failureLabel(e?.failure), confidenceLabel(e?.confidence)].filter(Boolean);
