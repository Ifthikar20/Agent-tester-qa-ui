/**
 * thinking.js — the line under a step while the runner works out an AI fix.
 *
 *   npm test
 *
 * The events are the contract's step.thinking: reading → deciding → checking
 * (only when a fix is applied) → done, and done ALWAYS comes — but a verdict,
 * or the run ending, must end the line even when it does not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_TEXT, PHASES, anyThinking, applyThinking, elapsedLabel, endThinking, thinkingOn } from '../src/thinking.js';

const idle = { i: 3, state: 'run', ms: null, error: null, fixes: [], thinking: null };
const ev = (phase, text) => ({ t: 'step.thinking', i: 3, phase, text });

test('a consult reads, decides, checks and ends — and its clock starts once', () => {
  let s = applyThinking(idle, ev('reading', 'Reading the page…'), 1000);
  assert.deepEqual(s.thinking, { phase: 'reading', text: 'Reading the page…', since: 1000 });
  assert.equal(idle.thinking, null);                             // a new step, the old one untouched

  s = applyThinking(s, ev('deciding', 'Working out what changed…'), 2500);
  assert.equal(s.thinking.phase, 'deciding');
  assert.equal(s.thinking.text, 'Working out what changed…');
  assert.equal(s.thinking.since, 1000);                          // not back to 0s on a new phase

  s = applyThinking(s, ev('checking', 'Checking the fix…'), 4000);
  assert.equal(s.thinking.phase, 'checking');
  assert.equal(s.thinking.since, 1000);

  s = applyThinking(s, ev('done', ''), 4200);
  assert.equal(s.thinking, null);
  assert.equal(s.state, 'run');                                  // ending the line is not a verdict

  // The next consult on the same step starts its own clock.
  s = applyThinking(s, ev('reading', 'Reading the page…'), 9000);
  assert.equal(s.thinking.since, 9000);
});

test('the runner\'s words win, a missing one falls back, and nothing long gets through as a status', () => {
  const check = applyThinking(idle, ev('deciding', 'Checking this is the element you recorded…'), 0);
  assert.equal(check.thinking.text, 'Checking this is the element you recorded…');
  assert.equal(applyThinking(idle, ev('reading', ''), 0).thinking.text, PHASE_TEXT.reading);
  assert.equal(applyThinking(idle, { phase: 'checking' }, 0).thinking.text, PHASE_TEXT.checking);
  const long = applyThinking(idle, ev('reading', 'x'.repeat(500)), 0).thinking.text;
  assert.ok(long.length <= 80, `${long.length} characters`);
  assert.deepEqual(PHASES, ['reading', 'deciding', 'checking', 'done']);
});

test('a verdict or the run ending clears a runner that never said done', () => {
  const thinking = applyThinking(idle, ev('deciding'), 0);
  assert.equal(endThinking(thinking).thinking, null);
  assert.equal(endThinking(idle), idle);                         // nothing to clear: the same object
  assert.equal(endThinking(undefined), undefined);
  assert.equal(applyThinking(thinking, ev('something_new'), 0).thinking, null);
  assert.equal(applyThinking(undefined, ev('reading'), 0), undefined);
  assert.equal(anyThinking([idle, thinking]), true);
  assert.equal(anyThinking([idle, endThinking(thinking)]), false);
  assert.equal(anyThinking(undefined), false);
});

test('the store\'s rule for every event: thinking applies, a verdict or run.end ends it, the rest leave it', () => {
  // A pass or a fail the store builds keeps everything else it set: only the line goes.
  const mid = thinkingOn(idle, ev('deciding', 'Working out what changed…'), 1000);
  const passed = thinkingOn({ ...mid, state: 'pass', ms: 900 }, { t: 'step.pass', i: 3, ms: 900 });
  assert.equal(passed.thinking, null);
  assert.equal(passed.state, 'pass');
  assert.equal(passed.ms, 900);
  const failed = thinkingOn({ ...mid, state: 'fail', error: 'boom' }, { t: 'step.fail', i: 3, error: 'boom' });
  assert.equal(failed.thinking, null);
  assert.equal(failed.error, 'boom');
  // run.end maps every step: the thinking one is cleared, a quiet one is the same object.
  const steps = [idle, mid].map((s) => thinkingOn(s, { t: 'run.end', ok: true }));
  assert.equal(steps[0], idle);
  assert.equal(steps[1].thinking, null);
  // Events that are not about thinking leave the step as it was, thinking included.
  assert.equal(thinkingOn(mid, { t: 'step.heal', i: 3, fix: {} }), mid);
  assert.equal(thinkingOn(mid, { t: 'log', msg: 'x' }), mid);
  assert.equal(thinkingOn(undefined, ev('reading')), undefined);
  assert.equal(thinkingOn(mid, undefined), mid);
  // A step told reading, deciding, then again reading (a second question) before done keeps its clock.
  let s = thinkingOn(idle, ev('reading'), 1000);
  s = thinkingOn(s, ev('deciding'), 2000);
  s = thinkingOn(s, ev('reading'), 3000);
  assert.equal(s.thinking.phase, 'reading');
  assert.equal(s.thinking.since, 1000);
  assert.equal(thinkingOn(s, ev('done', ''), 4000).thinking, null);
  // A done with nothing open (a runner that sent none before it) is harmless.
  assert.equal(thinkingOn(idle, ev('done', ''), 0), idle);
});

test('the clock says nothing for the first second, then whole seconds', () => {
  assert.equal(elapsedLabel(1000, 1999), '');
  assert.equal(elapsedLabel(1000, 2000), '1s');
  assert.equal(elapsedLabel(1000, 4700), '3s');
  assert.equal(elapsedLabel(undefined, 5000), '');
  assert.equal(elapsedLabel(Number.NaN, 5000), '');
});
