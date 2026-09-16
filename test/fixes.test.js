/**
 * fixes.js — how an automatic fix reads, wherever a run is shown.
 *
 *   npm test
 *
 * The fixtures are the contract's shapes: a fix as the socket sends it, and a
 * suggestion as GET /api/fixes returns it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND_LABELS, addFix, aiLockedReason, anySaved, confidenceLabel, countFixes, fixLines, fixesTitle, forSuite, groupByCase,
  kindLabel, modeLabel, passedWith, positionChange, positionLine, positionText, recordedAt, replacement, runVerdict,
  seenLabel, tierLabel, timeOf, whyLine,
} from '../src/fixes.js';

test('suggestion timestamps are ISO strings from the runner, and still order and age', () => {
  assert.equal(timeOf('2026-09-14T08:08:00.000Z'), Date.UTC(2026, 8, 14, 8, 8));
  assert.equal(timeOf(1234), 1234);
  assert.equal(timeOf('not a date'), 0);
  assert.equal(timeOf(undefined), 0);
  const rows = [
    { id: 'old', suiteId: 's1', caseId: 'c1', status: 'pending', createdAt: '2026-09-13T10:00:00.000Z', lastSeenAt: '2026-09-13T10:00:00.000Z' },
    { id: 'new', suiteId: 's1', caseId: 'c1', status: 'pending', createdAt: '2026-09-12T10:00:00.000Z', lastSeenAt: '2026-09-14T10:00:00.000Z' },
    { id: 'other', suiteId: 's1', caseId: 'c2', status: 'pending', createdAt: '2026-09-14T09:00:00.000Z', lastSeenAt: '2026-09-14T09:00:00.000Z' },
  ];
  const groups = groupByCase(rows);
  assert.deepEqual(groups.map((g) => g.key), ['s1/c1', 's1/c2']);
  assert.deepEqual(groups[0].fixes.map((f) => f.id), ['new', 'old']);
});

test('a run says its fixes wait on the Cases page only when one was kept', () => {
  assert.equal(anySaved([{ fixes: [{ kind: 'waited', saved: false }] }, { fixes: [] }]), false);
  assert.equal(anySaved([{ fixes: [{ kind: 'same_field', saved: true, id: 'fx_1' }] }]), true);
  assert.equal(anySaved(undefined), false);
});

const renamed = {
  kind: 'same_field', tier: 'rule', step: 3, op: 'fill',
  from: "fill 'Email' : label = $EMAIL", to: "'Email address' : textbox", insert: null,
  note: "Filled 'Email address', the same field under a new name", reason: null, confidence: null, saved: true, id: 'fx1',
};
const menu = {
  kind: 'opened_menu', tier: 'ai', step: 5, op: 'click',
  from: "click 'Sign out' : menuitem", to: null, insert: "click 'Account' : button",
  note: "Opened 'Account' first", reason: 'Sign out now lives in the account menu', confidence: 0.82, saved: true, id: 'fx2',
};
const popup = {
  kind: 'closed_popup', tier: 'rule', step: 1, op: 'click',
  from: "click 'Pricing' : navigation/link", to: null, insert: null,
  note: "Closed the cookie banner with 'Reject non-essential'", reason: null, confidence: null, saved: false,
};

const moved = {
  kind: 'moved', tier: 'rule', step: 2, op: 'click',
  from: "click 'Buy now' : button", to: null, insert: null,
  at: { x: 412, y: 340, w: 120, h: 36, vw: 1180, vh: 760 },
  note: "'Buy now' is 40px from where it was recorded", reason: null, confidence: null, saved: true, id: 'fx5',
};

test('every kind has words, and an unknown one still reads', () => {
  for (const k of ['waited', 'closed_popup', 'opened_menu', 'same_field', 'used_element', 'moved']) assert.ok(KIND_LABELS[k], k);
  assert.equal(kindLabel('moved'), 'Updated position');
  assert.equal(kindLabel('something_new'), 'Fixed');
  assert.equal(tierLabel('ai'), 'AI fix');
  assert.equal(tierLabel('rule'), 'Safe fix');
});

test('a replacement is the whole step, value kept and the vault never expanded', () => {
  assert.equal(replacement(renamed), "fill 'Email address' : textbox = $EMAIL");
  assert.equal(replacement({ ...menu, to: "'Log out' : navigation/button" }), "click 'Log out' : navigation/button");
  assert.equal(replacement(menu), null);                                         // the target did not change
  assert.equal(replacement({ op: 'hover', from: 'teleport somewhere', to: "'Menu' : button" }), "hover 'Menu' : button");
});

test('a fix reads as the recorded step first, then what changes', () => {
  assert.deepEqual(fixLines(renamed).map((l) => [l.role, l.text]), [
    ['from', "fill 'Email' : label = $EMAIL"],
    ['to', "fill 'Email address' : textbox = $EMAIL"],
  ]);
  assert.deepEqual(fixLines(menu).map((l) => [l.role, l.label, l.text]), [
    ['from', 'Recorded', "click 'Sign out' : menuitem"],
    ['insert', 'Insert before it', "click 'Account' : button"],
  ]);
  assert.deepEqual(fixLines(popup).map((l) => l.role), ['from']);
});

test('a moved element reads as the recorded step, then where its position goes', () => {
  const was = { x: 412, y: 300, w: 120, h: 36, vw: 1180, vh: 760 };
  assert.deepEqual(fixLines(moved, { was }).map((l) => [l.role, l.label, l.text]), [
    ['from', 'Recorded', "click 'Buy now' : button"],
    ['at', 'Update recorded position', '412,300 → 412,340'],
  ]);
  // Where it was recorded is not known: the new position is still the fix.
  assert.deepEqual(fixLines(moved).map((l) => [l.role, l.text]), [['from', "click 'Buy now' : button"], ['at', '412,340']]);
  // No position at all, and nothing is invented.
  assert.deepEqual(fixLines({ ...moved, at: null }).map((l) => l.role), ['from']);
  assert.equal(replacement(moved), null);                                        // no step is rewritten
  assert.equal(positionLine(moved, was), 'Update recorded position: 412,300 → 412,340');
  assert.equal(positionLine(renamed, was), null);
  assert.equal(positionChange({ at: { x: 10.4, y: 19.6 } }, { x: 'a', y: 1 }), '10,20');
  assert.equal(positionText(undefined), null);
});

test('a case\'s own mark says where a step was recorded, by the run\'s step index', () => {
  const flow = [
    'flowchart TD',
    "  A[goto https://shop.test] --> B[click 'Buy now' : button]",
    '%% at 1 12,40 80x20 in 1180x760',
    '%% at 2 412,300 120x36 in 1180x760',
  ].join('\n');
  assert.deepEqual(recordedAt(flow, 2), { x: 412, y: 300, w: 120, h: 36, vw: 1180, vh: 760 });
  assert.deepEqual(recordedAt(flow, 1), { x: 12, y: 40, w: 80, h: 20, vw: 1180, vh: 760 });
  assert.equal(recordedAt(flow, 0), null);
  assert.equal(recordedAt(undefined, 2), null);
  assert.equal(positionLine(moved, recordedAt(flow, moved.step)), 'Update recorded position: 412,300 → 412,340');
});

test('only an AI fix has a why, and a confidence is a percentage whatever scale it came in', () => {
  assert.equal(whyLine(menu), 'Sign out now lives in the account menu · 82% sure');
  assert.equal(whyLine(renamed), null);
  assert.equal(confidenceLabel(0.815), '82% sure');
  assert.equal(confidenceLabel(64), '64% sure');
  assert.equal(confidenceLabel(null), null);
  assert.equal(confidenceLabel(Number.NaN), null);
});

test('the same fix reported twice is one fix, and a run counts what its steps carry', () => {
  let list = addFix([], renamed);
  list = addFix(list, { ...renamed });            // step.pass repeating step.heal
  list = addFix(list, popup);
  assert.equal(list.length, 2);
  assert.equal(countFixes([{ fixes: list }, { fixes: [] }, {}, { fixes: [menu] }]), 3);
  assert.equal(passedWith(0), 'Passed');
  assert.equal(passedWith(1), 'Passed with 1 fix');
  assert.equal(passedWith(3), 'Passed with 3 fixes');
});

test('a pass that needed fixes is its own verdict, and a failure stays a failure', () => {
  assert.equal(runVerdict({ ok: true, fixed: 0 }), 'pass');
  assert.equal(runVerdict({ ok: true }), 'pass');                  // a row from before fixes existed
  assert.equal(runVerdict({ ok: true, fixed: 2 }), 'fixed');
  assert.equal(runVerdict({ ok: false, fixed: 2 }), 'fail');
  assert.equal(seenLabel(1), 'seen once');
  assert.equal(seenLabel(4), 'seen 4 times');
});

test('a history row explains its fixes on hover, including the ones it was not sent', () => {
  assert.equal(fixesTitle({ ok: true, fixed: 0, fixes: [] }), undefined);
  assert.equal(fixesTitle({ ok: true, fixed: 2, fixes: [popup, renamed] }), `${popup.note}\n${renamed.note}`);
  assert.equal(fixesTitle({ ok: true, fixed: 23, fixes: [popup] }), `${popup.note}\nand 22 more`);
  assert.equal(fixesTitle({ ok: true, fixed: 3 }), 'Passed with 3 fixes');
});

test('suggestions group by case inside their suite, the most recently seen first', () => {
  const rows = [
    { ...renamed, suiteId: 's1', caseId: 'c1', caseName: 'Sign in', status: 'pending', createdAt: 10, lastSeenAt: 20, seen: 2 },
    { ...menu, suiteId: 's1', caseId: 'c2', caseName: 'Sign out', status: 'pending', createdAt: 30, lastSeenAt: 40, seen: 1 },
    { ...menu, id: 'fx3', suiteId: 's1', caseId: 'c1', caseName: 'Sign in', status: 'pending', createdAt: 5, lastSeenAt: 50, seen: 3 },
    { ...renamed, id: 'fx4', suiteId: 's2', caseId: 'c1', caseName: 'Other suite, same case id', status: 'pending', createdAt: 1, lastSeenAt: 1, seen: 1 },
  ];
  const groups = groupByCase(rows);
  assert.deepEqual(groups.map((g) => g.key), ['s1/c1', 's1/c2', 's2/c1']);
  assert.deepEqual(groups[0].fixes.map((f) => f.id), ['fx3', 'fx1']);
  const s1 = forSuite(rows, 's1');
  assert.deepEqual(Object.keys(s1).sort(), ['c1', 'c2']);
  assert.equal(s1.c1.length, 2);
});

test('the chip says what this organisation actually gets', () => {
  const on = { mode: 'ai', ai: { enabled: true, available: true, reason: null }, canManage: true };
  assert.equal(modeLabel(on), 'AI fixes on');
  assert.equal(modeLabel({ ...on, ai: { enabled: false, available: true, reason: 'organisation' } }), 'Safe fixes on');
  assert.equal(modeLabel({ ...on, ai: { enabled: true, available: false, reason: 'key' } }), 'Safe fixes on');
  assert.equal(modeLabel({ mode: 'safe', ai: { enabled: false, available: false, reason: 'deployment' }, canManage: true }), 'Safe fixes on');
  assert.equal(modeLabel({ mode: 'off', ai: { enabled: false, available: false, reason: 'deployment' }, canManage: true }), 'Automatic fixes off');
  assert.equal(modeLabel(null), 'Automatic fixes off');
});

test('the toggle is locked with a reason the operator or a role owns — never for not having opted in', () => {
  const base = { mode: 'ai', ai: { enabled: false, available: true, reason: 'organisation' }, canManage: true };
  assert.equal(aiLockedReason(base), null);
  assert.match(aiLockedReason({ ...base, ai: { enabled: false, available: false, reason: 'key' } }), /key/);
  assert.match(aiLockedReason({ ...base, ai: { enabled: false, available: false, reason: 'switch' } }), /operator/);
  assert.match(aiLockedReason({ ...base, mode: 'safe', ai: { enabled: false, available: false, reason: 'deployment' } }), /deployment/);
  assert.match(aiLockedReason({ ...base, canManage: false }), /owner or admin/);
});
