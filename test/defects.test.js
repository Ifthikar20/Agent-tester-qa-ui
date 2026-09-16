/**
 * defects.js — how the Defects page reads, searches and describes what the
 * runner filed.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, activityLine, applyFilters, assigneesIn, canonicalId, countViews,
  filtersFrom, matches, queryFrom, sortDefects, suitesIn, whereOf,
} from '../src/defects.js';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 12, 12);

const defect = (over = {}) => ({
  id: 'DEF-2609-001', title: '"option:Texas" never became visible', origin: 'https://treasury.sh',
  url: 'https://treasury.sh/signup', step: 3, firstSeen: NOW - 48 * HOUR, lastSeen: NOW - HOUR, hits: 3,
  reopened: 0, closedAt: null,
  cases: [{ key: 'cs-a', id: 'cs-a', name: 'Sign up', suiteId: 'su-t', suite: 'Treasury' }],
  suites: [{ id: 'su-t', name: 'Treasury' }],
  status: 'open', severity: 'minor', autoSeverity: 'minor', severityBy: 'ghostclick',
  assignee: null, reporter: 'ghostclick',
  ...over,
});

const MONICA = { id: '7', email: 'monica@shop.example', name: 'Monica' };
const LIST = [
  defect(),
  defect({
    id: 'DEF-2609-002', title: 'expected the URL to contain "/cart"', status: 'reopened', severity: 'major',
    firstSeen: NOW - 40 * 24 * HOUR, lastSeen: NOW - 20 * 24 * HOUR, hits: 9, assignee: MONICA,
    cases: [
      { key: 'cs-c', id: 'cs-c', name: 'Checkout', suiteId: 'su-s', suite: 'Shop' },
      { key: 'cs-d', id: 'cs-d', name: 'Basket', suiteId: 'su-s', suite: 'Shop' },
    ],
    suites: [{ id: 'su-s', name: 'Shop' }],
  }),
  defect({ id: 'DEF-2609-010', title: 'The basket is empty', status: 'closed', severity: 'critical', lastSeen: NOW - 2 * HOUR, hits: 1 }),
  defect({
    id: 'DEF-2610-001', title: 'Nothing says "Thank you"', status: 'wont_fix', severity: 'critical',
    firstSeen: NOW - HOUR / 2, lastSeen: NOW, assignee: { id: '8', email: 'kevin@shop.example', name: 'Kevin' },
  }),
];
const ids = (list) => list.map((d) => d.id);
const everything = (over = {}) => ({ ...DEFAULTS, view: 'all', ...over });

test('a number is read however it is typed, and nothing else is one', () => {
  for (const s of ['DEF-2609-007', 'def-2609-7', '2609-007', '#2609-7', '2609007', ' def 2609 07 ']) {
    assert.equal(canonicalId(s), 'DEF-2609-007', s);
  }
  for (const s of ['DEF-2613-001', 'DEF-2609-000', 'DEF-2609', 'checkout', '26-09-7', '', null, undefined]) {
    assert.equal(canonicalId(s), null, String(s));
  }
});

test('a number typed in full finds that defect, whatever the view and the filters say', () => {
  const f = { ...filtersFrom({}), q: 'def-2609-10', severity: 'minor', assignee: 'none' };
  assert.deepEqual(ids(applyFilters(LIST, f, { now: NOW })), ['DEF-2609-010']);
  assert.deepEqual(ids(applyFilters(LIST, { ...f, q: 'DEF-2609-999' }, { now: NOW })), []);
});

test('the default view is what is failing and not parked', () => {
  assert.deepEqual(ids(applyFilters(LIST, filtersFrom({}), { now: NOW })), ['DEF-2609-001', 'DEF-2609-002']);
});

test('every word is looked for in the number, sentence, step, cases, suites, site and assignee', () => {
  assert.ok(matches(LIST[1], 'monica cart'));
  assert.ok(matches(LIST[1], 'BASKET shop'));
  assert.ok(matches(LIST[0], 'treasury.sh'));
  assert.ok(matches(defect({ title: 'locator.waitFor: Timeout 8000ms exceeded.', target: "see 'Thank you for your order'" }), 'thank you'),
    'a generic sentence is found by the step it was about');
  assert.ok(!matches(LIST[0], 'texas shop'));
  // Part of a number is a word like any other: every September defect.
  assert.deepEqual(ids(applyFilters(LIST, everything({ q: '2609' }), { now: NOW })), ['DEF-2609-001', 'DEF-2609-002', 'DEF-2609-010']);
});

test('severity, assignee, suite and last seen narrow the list', () => {
  const opts = { now: NOW, me: { id: '7', email: 'monica@shop.example' } };
  assert.deepEqual(ids(applyFilters(LIST, everything({ severity: 'critical' }), opts)), ['DEF-2609-010', 'DEF-2610-001']);
  assert.deepEqual(ids(applyFilters(LIST, everything({ assignee: 'me' }), opts)), ['DEF-2609-002']);
  assert.deepEqual(ids(applyFilters(LIST, everything({ assignee: 'none' }), opts)), ['DEF-2609-001', 'DEF-2609-010']);
  assert.deepEqual(ids(applyFilters(LIST, everything({ assignee: 'kevin@shop.example' }), opts)), ['DEF-2610-001']);
  assert.deepEqual(ids(applyFilters(LIST, everything({ suite: 'su-s' }), opts)), ['DEF-2609-002']);
  assert.deepEqual(ids(applyFilters(LIST, everything({ seen: '7d' }), opts)), ['DEF-2609-001', 'DEF-2609-010', 'DEF-2610-001']);
  assert.deepEqual(ids(applyFilters(LIST, everything({ assignee: 'me' }), { now: NOW })), [], 'nobody signed in is assigned nothing');
});

test('numbers sort as numbers, and the worst severity comes first when reversed', () => {
  assert.deepEqual(ids(sortDefects([...LIST].reverse(), 'id')), ['DEF-2609-001', 'DEF-2609-002', 'DEF-2609-010', 'DEF-2610-001']);
  assert.deepEqual(ids(sortDefects(LIST, '-severity')).slice(0, 2), ['DEF-2610-001', 'DEF-2609-010'], 'critical first, the newest seen breaking the tie');
  assert.deepEqual(ids(sortDefects(LIST)), ['DEF-2610-001', 'DEF-2609-001', 'DEF-2609-010', 'DEF-2609-002'], 'most recently seen by default');
  assert.deepEqual(ids(sortDefects(LIST, 'nonsense')), ids(sortDefects(LIST, 'seen')));
});

test('the URL holds the filters, leaves the defaults out, and ignores what it does not know', () => {
  assert.deepEqual(filtersFrom({}), DEFAULTS);
  assert.deepEqual(filtersFrom({ view: 'bogus', severity: 'blocker', seen: 'forever', sort: '-height' }), DEFAULTS);
  const f = filtersFrom({ view: 'closed', q: 'cart', severity: 'major', assignee: 'none', suite: 'su-s', seen: '7d', sort: 'id' });
  assert.deepEqual(filtersFrom(queryFrom(f)), f);
  assert.deepEqual(queryFrom({ ...DEFAULTS, severity: 'critical' }), { severity: 'critical' });
  assert.equal(filtersFrom({ q: ['one', 'two'] }).q, 'one', 'a repeated key is read once');
});

test('each view counts its own', () => {
  assert.deepEqual(countViews(LIST), { open: 2, reopened: 1, parked: 1, closed: 1, all: 4 });
});

test('the filter menus list the suites and people the defects name, once each', () => {
  assert.deepEqual(suitesIn(LIST), [{ key: 'su-s', name: 'Shop' }, { key: 'su-t', name: 'Treasury' }]);
  assert.deepEqual(assigneesIn(LIST).map((a) => a.label), ['Kevin', 'Monica']);
});

test('activity reads as sentences, with the application named as itself', () => {
  const kevin = { email: 'kevin@shop.example' };
  assert.equal(activityLine({ kind: 'filed', by: null, text: 'Sign up failed at step 4' }), 'Filed by ghostclick: Sign up failed at step 4');
  assert.equal(activityLine({ kind: 'severity', by: kevin, from: null, to: 'critical' }), 'kevin@shop.example set the severity to Critical');
  assert.equal(activityLine({ kind: 'severity', by: kevin, from: 'critical', to: null }), 'kevin@shop.example gave the severity back to ghostclick');
  assert.equal(activityLine({ kind: 'resolution', by: { email: null }, from: null, to: 'wont_fix' }), "Someone on this runner marked it Won't fix");
  assert.equal(activityLine({ kind: 'assignee', by: kevin, from: null, to: MONICA }), 'kevin@shop.example assigned it to Monica');
  assert.equal(activityLine({ kind: 'assignee', by: kevin, from: MONICA, to: null }), 'kevin@shop.example unassigned Monica');
});

test('where a defect happens fits on a line', () => {
  assert.equal(whereOf(LIST[0]), 'Treasury · Sign up');
  assert.equal(whereOf(LIST[1]), 'Shop · Checkout · +1 more case');
  const console = defect({
    cases: [{ key: 'Recorded flow:https://x.example/', id: null, name: null, suiteId: null, suite: 'Recorded flow' }],
    suites: [{ id: null, name: 'Recorded flow' }],
  });
  assert.equal(whereOf(console), 'Recorded flow · a script run from the console');
});
