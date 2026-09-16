/**
 * reasoning.js — how a step was worked out, as the console draws it.
 *
 *   npm test
 *
 * The events are the contract's step.trace (one entry) and step.pass /
 * step.fail carrying the whole list, which wins.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND_LABELS, MAX_ENTRIES, addEntry, byAi, entryChips, failureLabel, isEntry, kindLabel, traceHeading, traceOn, traceOpen, traceSummary,
} from '../src/reasoning.js';

const running = { i: 3, state: 'run', ms: null, error: null, fixes: [], thinking: null, trace: [] };
const entry = (kind, text, extra = {}) => ({ kind, tier: 'runner', text, ...extra });

test('entries arrive one at a time and the verdict\'s list wins', () => {
  let s = traceOn(running, { t: 'step.trace', i: 3, entry: entry('saw', "'Sign in' : button did not appear") });
  s = traceOn(s, { t: 'step.trace', i: 3, entry: entry('asked', 'Asked the AI what changed', { tier: 'ai' }) });
  assert.deepEqual(s.trace.map((e) => e.kind), ['saw', 'asked']);
  assert.equal(running.trace.length, 0);                        // a new step each time, the old one untouched

  const whole = [entry('saw', 'x'), entry('rule', 'y', { tier: 'rule', ok: false }), entry('asked', 'z', { tier: 'ai' }), entry('decided', 'w', { tier: 'ai' })];
  const passed = traceOn({ ...s, state: 'pass' }, { t: 'step.pass', i: 3, ms: 10, trace: whole });
  assert.deepEqual(passed.trace, whole);
  // A verdict without a trace (a runner too old, or a step that needed no help) leaves what arrived.
  assert.equal(traceOn(s, { t: 'step.pass', i: 3, ms: 10 }).trace.length, 2);
  // Nothing else touches it.
  assert.equal(traceOn(s, { t: 'step.heal', i: 3, fix: {} }), s);
  assert.equal(traceOn(s, { t: 'step.thinking', phase: 'reading' }), s);
  assert.equal(traceOn(undefined, { t: 'step.trace', entry: entry('saw', 'x') }), undefined);
  assert.equal(traceOn(s, undefined), s);
});

test('only entries worth drawing are kept, and no more than the cap', () => {
  assert.equal(isEntry(entry('saw', 'x')), true);
  assert.equal(isEntry(entry('saw', '   ')), false);
  assert.equal(isEntry({ kind: 'saw' }), false);
  assert.equal(isEntry(null), false);
  assert.equal(addEntry(running, { kind: 'saw', text: '' }), running);
  let s = running;
  for (let k = 0; k < MAX_ENTRIES + 5; k++) s = addEntry(s, entry('note', `n${k}`));
  assert.equal(s.trace.length, MAX_ENTRIES);
  const failed = traceOn(running, { t: 'step.fail', i: 3, trace: [entry('why', 'because'), { kind: 'why' }, null] });
  assert.deepEqual(failed.trace.map((e) => e.text), ['because']);
});

test('the heading says whose working it is, and the folded line says the answer first', () => {
  const rules = [entry('saw', 'covered'), entry('did', "Closed the dialog with 'Reject all'", { tier: 'rule' })];
  assert.equal(byAi(rules), false);
  assert.equal(traceHeading(rules), 'What the runner tried');
  assert.equal(traceSummary(rules), "Closed the dialog with 'Reject all'");

  const renamed = [...rules, entry('decided', 'Use button "Log in" instead', { tier: 'ai', detail: 'renamed in place' }), entry('did', 'Used it', { tier: 'ai' })];
  assert.equal(traceHeading(renamed), 'How the AI worked it out');
  assert.equal(traceSummary(renamed), 'Use button "Log in" instead — renamed in place');

  const explained = [entry('note', 'Checks are never changed'), entry('why', 'The check expects a frame\'s address.', { tier: 'ai', failure: 'test_script' })];
  assert.equal(traceSummary(explained), "Test script: The check expects a frame's address.");
  assert.equal(traceSummary([]), '');
  assert.equal(traceSummary(undefined), '');
  assert.equal(traceSummary([entry('note', 'only this')]), 'only this');
});

test('a running or failed step shows its trace open; a passed one folds; a person\'s choice wins', () => {
  assert.equal(traceOpen({ i: 1, state: 'run' }), true);
  assert.equal(traceOpen({ i: 1, state: 'fail' }), true);
  assert.equal(traceOpen({ i: 1, state: 'pass' }), false);
  assert.equal(traceOpen({ i: 1, state: 'pass' }, new Map([[1, true]])), true);
  assert.equal(traceOpen({ i: 1, state: 'fail' }, new Map([[1, false]])), false);
  assert.equal(traceOpen({ i: 2, state: 'fail' }, new Map([[1, false]])), true);
});

test('labels and chips', () => {
  assert.equal(kindLabel('ruled_out'), 'Ruled out');
  assert.equal(kindLabel('something new'), 'Note');
  assert.equal(Object.keys(KIND_LABELS).length, 11);
  assert.equal(failureLabel('test_script'), 'Test script');
  assert.equal(failureLabel('nope'), null);
  assert.deepEqual(entryChips({ failure: 'app_bug', confidence: 0.82 }), ['App bug', '82% sure']);
  assert.deepEqual(entryChips({ kind: 'saw' }), []);
  assert.deepEqual(entryChips(undefined), []);
});
