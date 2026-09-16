/**
 * stepnotes.js — what the runner worked out about each recorded step.
 *
 *   npm test
 *
 * The events are the contract's `recorded` (a new revision, with its notes)
 * and `record.notes` (the notes of one revision), and the fix goes back as
 * `record.fix` on the revision it was offered on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  concernCount, concernLabel, fixLabel, fixMessage, isThinking, notesByIndex, notesOn, offeredFix, thinkingCount,
} from '../src/stepnotes.js';

const thinking = { i: 4, state: 'thinking' };
const repeated = { i: 5, state: 'done', tier: 'rule', summary: 'Did step 5 again', concern: { kind: 'repeated', by: 'rule', text: 'Again.', fix: 'remove_step' } };
const typed = { i: 6, state: 'done', tier: 'ai', summary: 'Typed the email', concern: { kind: 'typed_private_value', by: 'rule', text: 'Plain text.', fix: 'none' } };

test('a recording\'s revision brings its notes; notes of another revision are not drawn', () => {
  let state = { rev: 0, notes: [] };
  state = notesOn(state, { t: 'recorded', count: 5, flow: '…', rev: 7, notes: [thinking] });
  assert.deepEqual(state, { rev: 7, notes: [thinking] });
  state = notesOn(state, { t: 'record.notes', rev: 7, notes: [repeated, { i: -1 }, null, 'x'] });
  assert.deepEqual(state, { rev: 7, notes: [repeated] });
  // A note about the revision before a step was taken out is about other steps now.
  const stale = notesOn(state, { t: 'record.notes', rev: 6, notes: [typed] });
  assert.equal(stale, state);
  // A runner that sends no revision changes nothing here, and neither does anything else.
  assert.equal(notesOn(state, { t: 'recorded', count: 5, flow: '…' }), state);
  assert.equal(notesOn(state, { t: 'log', msg: 'x' }), state);
  assert.equal(notesOn(state, undefined), state);
  assert.deepEqual(notesOn(undefined, { t: 'recorded', rev: 1 }), { rev: 1, notes: [] });
});

test('notes are looked up by step index, and say what they offer', () => {
  const by = notesByIndex([thinking, repeated, typed, { i: 'x' }]);
  assert.equal(by.size, 3);
  assert.equal(by.get(5), repeated);
  assert.equal(isThinking(by.get(4)), true);
  assert.equal(isThinking(by.get(5)), false);
  assert.deepEqual(offeredFix(repeated), { fix: 'remove_step', label: 'Remove step' });
  assert.equal(offeredFix(typed), null);
  assert.equal(offeredFix(thinking), null);
  assert.deepEqual(fixMessage(repeated, 9), { t: 'record.fix', i: 5, rev: 9, fix: 'remove_step' });
  assert.equal(notesByIndex(undefined).size, 0);
});

test('labels and counts', () => {
  assert.equal(concernLabel('in_frame'), 'Inside a frame');
  assert.equal(concernLabel('whatever'), 'Looks wrong');
  assert.equal(fixLabel('remove_step'), 'Remove step');
  assert.equal(fixLabel('none'), null);
  assert.equal(thinkingCount([thinking, repeated, typed]), 1);
  assert.equal(concernCount([thinking, repeated, typed]), 2);
  assert.equal(concernCount(undefined), 0);
});
