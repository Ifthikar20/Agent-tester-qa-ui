/**
 * The vocabulary: every verb the language has, declared once.
 *
 * A verb used to be spread across eight files — parsed in flow.js, written back
 * in flow.js, executed in ops.js, gated in ops.js, drawn in diagram.js, echoed
 * in ConsoleView.vue, produced in recorder.js, and copied into the extension.
 * Adding one meant finding all eight, and `showOp`'s `default: return null`
 * meant a step nobody had taught to write itself was silently dropped from the
 * script rather than reported.
 *
 * So each verb is one row here:
 *
 *   op / assert   the IR it produces
 *   syntax        how it is written, tried in order
 *   show          how it is written back        (the inverse of syntax)
 *   label         how it is drawn, short
 *   check         what makes it valid           (true, or the reason it is not)
 *
 * This module is PURE. It imports nothing, touches no browser and no disk,
 * because flow.js is copied verbatim into the browser extension and must not
 * drag Playwright along with it. The `run` half of each verb lives in ops.js,
 * which attaches itself to this table by name and refuses to load if the two
 * sets ever differ.
 */

/**
 * Which version of this language this is.
 *
 * Three projects parse this grammar and, since the split, one of them is in
 * another repository: the UI renders steps from its own copy of this file.
 * Nothing imports across, so drift cannot fail loudly — a verb added here is
 * simply a step the UI draws as nothing at all, on a day nobody changed the
 * UI.
 *
 * So the language carries a number. The runner reports it at /api/version,
 * which gives a consumer holding a copy something to compare itself against
 * and somewhere to say "this runner speaks a language I do not" — the check
 * that a published package would otherwise do at install time.
 *
 * `npm run check:shared` is what stops the number going stale: the digest of
 * this file and flow.js is pinned in scripts/copies.js, and a grammar that has
 * changed without this moving fails there.
 */
export const LANGUAGE_VERSION = 4;

/**
 * How long a `goal`'s sentence may be.
 *
 * A goal is one instruction — "sign in as the demo student", "get to the
 * checkout with one item in the basket". Past a line it stops being an
 * instruction and starts being a test case somebody declined to write down,
 * and the run that expands it has no way to tell you which half it failed.
 */
export const GOAL_MAX = 120;

// ------------------------------------------------------------------ literals

/** Strip one layer of surrounding single quotes. */
export const unq = (s) => String(s ?? '').trim().replace(/^'(.*)'$/s, '$1');

/**
 * `'a' * 20` -> 'aaa…'; `$KEY` -> a vault reference; else a literal.
 *
 * There is no expression evaluation here on purpose — repetition is the one
 * thing a test genuinely needs to say (a field's length limit) and it is
 * spelled as a bounded literal rather than as code.
 */
export function value(raw) {
  const s = String(raw ?? '').trim();
  if (s.startsWith('$')) return { valueRef: `secrets.${s.slice(1)}` };

  const rep = s.match(/^'(.*)'\s*[*×]\s*(\d+)$/s);
  if (rep) return { value: rep[1].repeat(Math.min(Number(rep[2]), 500)) };

  const n = s.match(/^(\d+)\s*chars?$/);
  if (n) return { value: 'a'.repeat(Math.min(Number(n[1]), 500)) };

  return { value: unq(s) };
}

/** `'Sign in' : button` -> `button:Sign in`, the target grammar targets.js speaks. */
export function target(raw) {
  // The strategy half may carry a scope prefix — `navigation/link`, `nth2/link`.
  const m = String(raw ?? '').trim().match(/^(.*?)\s*:\s*((?:[A-Za-z0-9]+\/)?[A-Za-z]+)$/s);
  // A bare alias, e.g. `auth.submit`. Still goes through parseTarget later.
  if (!m) return unq(raw);
  return `${m[2].trim()}:${unq(m[1])}`;
}

/**
 * `navigation/link:Pricing` -> `'Pricing' : navigation/link`
 *
 * The scope rides with the strategy rather than being dropped, because a
 * script that silently forgets WHICH Pricing link you meant is a script that
 * clicks the footer on Tuesday.
 */
export const showTarget = (t) => {
  const i = String(t ?? '').indexOf(':');
  return i < 1 ? String(t ?? '') : `'${t.slice(i + 1)}' : ${t.slice(0, i)}`;
};

/** Vault references are named, never expanded — not here, not anywhere. */
const showValue = (s) => (s.valueRef ? `$${s.valueRef.replace(/^secrets\./, '')}` : `'${s.value}'`);

// ------------------------------------------------------------------- keys

/** The keys `press` knows, by the names Playwright presses them by. */
export const KEY_NAMES = ['Enter', 'Tab', 'Escape', 'Space', 'Backspace', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
const KEY_ALIASES = {
  return: 'Enter', esc: 'Escape', del: 'Delete', spacebar: 'Space', pgup: 'PageUp', pgdn: 'PageDown',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  uparrow: 'ArrowUp', downarrow: 'ArrowDown', leftarrow: 'ArrowLeft', rightarrow: 'ArrowRight',
};
const MODIFIERS = { shift: 'Shift', control: 'Control', ctrl: 'Control', alt: 'Alt', meta: 'Meta', cmd: 'Meta', command: 'Meta', controlormeta: 'ControlOrMeta' };

/**
 * `enter` → `Enter`, `shift+tab` → `Shift+Tab`, `ctrl+a` → `Control+a`. A name
 * this does not know comes back as it was written, so `check` refuses it by
 * name rather than something guessing at what was meant.
 */
export function keyName(raw) {
  return String(raw ?? '').trim().split('+').map((p) => p.trim()).filter(Boolean).map((p) => {
    const l = p.toLowerCase();
    return KEY_NAMES.find((k) => k.toLowerCase() === l) ?? KEY_ALIASES[l] ?? MODIFIERS[l] ?? p;
  }).join('+');
}

/** True when `press` presses it: a named key, or one character, behind any modifiers. */
export function isKey(name) {
  const parts = String(name ?? '').split('+');
  const last = parts.pop();
  if (!parts.every((m) => Object.values(MODIFIERS).includes(m))) return false;
  return KEY_NAMES.includes(last) || (parts.length > 0 && last.length === 1);
}

// ---------------------------------------------------------------- the verbs

/**
 * One row per surface form. Order matters inside `syntax` and across rows:
 * `scroll to top` must be tried before `scroll to <target>`, or "top" becomes
 * the name of an element nobody has.
 */
export const VERBS = [
  {
    op: 'click',
    syntax: [{ re: /^click\s+(.+)$/i, ir: (m) => ({ target: target(m[1]) }) }],
    show: (s) => `click ${showTarget(s.target)}`,
    label: (s, t) => `click ${t(s.target, 16)}`,
    say: (s) => `Click ${sayTarget(s.target)}`,
  },
  {
    // Go there and stay, without clicking — for a menu that only exists while
    // the pointer is on whatever opens it.
    op: 'hover',
    syntax: [{ re: /^hover\s+(.+)$/i, ir: (m) => ({ target: target(m[1]) }) }],
    show: (s) => `hover ${showTarget(s.target)}`,
    label: (s, t) => `hover ${t(s.target, 16)}`,
    say: (s) => `Point at ${sayTarget(s.target)}`,
  },
  {
    op: 'fill',
    syntax: [{
      re: /^fill\s+(.+?)\s*=\s*(.+)$/i,
      ir: (m) => ({ target: target(m[1]), ...value(m[2]) }),
    }],
    show: (s) => `fill ${showTarget(s.target)} = ${showValue(s)}`,
    label: (s, t) => (s.valueRef ? `fill ${t(s.target, 12)} ← vault` : `fill ${t(s.target, 17)}`),
    say: (s) => `Type ${sayValue(s)} into ${sayTarget(s.target)}`,
  },
  {
    op: 'wait',
    syntax: [{ re: /^wait\s+(\d+)\s*ms$/i, ir: (m) => ({ ms: Number(m[1]) }) }],
    show: (s) => `wait ${s.ms}ms`,
    label: (s) => `wait ${s.ms}ms`,
    say: (s) => `Wait ${s.ms > 999 ? `${(s.ms / 1000).toFixed(1)} seconds` : `${s.ms}ms`}`,
  },
  {
    // Moving the page is an action, not scenery. `top` and `bottom` mean the
    // same thing at any viewport; anything else scrolls a named element in.
    op: 'scroll',
    syntax: [
      { re: /^scroll\s+to\s+(top|bottom)$/i, ir: (m) => ({ to: m[1].toLowerCase() }) },
      { re: /^scroll\s+to\s+(.+)$/i, ir: (m) => ({ target: target(m[1]) }) },
    ],
    show: (s) => `scroll to ${s.to ?? showTarget(s.target)}`,
    label: (s, t) => (s.to ? `scroll ${s.to}` : `scroll to ${t(s.target, 12)}`),
    say: (s) => (s.to ? `Scroll to the ${s.to} of the page` : `Scroll to ${sayTarget(s.target)}`),
    // Boolean(), not the target itself: checkAction treats anything but `true`
    // as the reason a step is invalid, so returning `s.target` refused every
    // named scroll at save, giving its own target as the reason.
    check: (s) => Boolean(s.target) || s.to === 'top' || s.to === 'bottom'
      || 'scroll needs a target, or "top"/"bottom"',
  },
  {
    // A checkbox, a switch or a radio, put in a state — not toggled. A click
    // would flip whatever it found, which is a different test every run.
    op: 'tick',
    syntax: [{ re: /^tick\s+(.+)$/i, ir: (m) => ({ target: target(m[1]) }) }],
    show: (s) => `tick ${showTarget(s.target)}`,
    label: (s, t) => `tick ${t(s.target, 17)}`,
    say: (s) => `Tick ${sayTarget(s.target)}`,
  },
  {
    op: 'untick',
    syntax: [{ re: /^untick\s+(.+)$/i, ir: (m) => ({ target: target(m[1]) }) }],
    show: (s) => `untick ${showTarget(s.target)}`,
    label: (s, t) => `untick ${t(s.target, 15)}`,
    say: (s) => `Untick ${sayTarget(s.target)}`,
  },
  {
    // An option in a dropdown, by the words on it: a native select, or a
    // combobox of the page's own that opens on a click. Written like fill —
    // the field, then what goes in it — so an option with "in" in its name
    // can never be read as two.
    op: 'choose',
    syntax: [{
      re: /^choose\s+(.+?)\s*=\s*(.+)$/i,
      ir: (m) => ({ target: target(m[1]), ...value(m[2]) }),
    }],
    show: (s) => `choose ${showTarget(s.target)} = ${showValue(s)}`,
    label: (s, t) => (s.valueRef ? `choose ${t(s.target, 12)} ← vault` : `choose ${t(s.value, 8)} in ${t(s.target, 8)}`),
    say: (s) => `Choose ${sayValue(s)} in ${sayTarget(s.target)}`,
    check: (s) => (Boolean(s.target) && (Boolean(s.valueRef) || (typeof s.value === 'string' && s.value.trim().length > 0)))
      || 'choose needs the dropdown and the option to pick in it',
  },
  {
    // A key — on a named control, or wherever the focus is. Enter in a search
    // box is the only way to submit some forms; Escape closes what a click
    // opened. The keys are named, and a name outside the list is refused, so
    // a typo cannot press something else.
    op: 'press',
    syntax: [
      { re: /^press\s+(\S+)\s+in\s+(.+)$/i, ir: (m) => ({ key: keyName(m[1]), target: target(m[2]) }) },
      { re: /^press\s+(\S+)$/i, ir: (m) => ({ key: keyName(m[1]) }) },
    ],
    show: (s) => `press ${s.key}${s.target ? ` in ${showTarget(s.target)}` : ''}`,
    label: (s, t) => `press ${t(s.key, 9)}${s.target ? ` in ${t(s.target, 9)}` : ''}`,
    say: (s) => `Press ${s.key}${s.target ? ` in ${sayTarget(s.target)}` : ''}`,
    check: (s) => isKey(s.key) || `press knows ${KEY_NAMES.join(', ')} (with Shift, Control, Alt or Meta in front) — not "${s.key}"`,
  },

  {
    /**
     * A step written as what to achieve, not as what to press.
     *
     * Every other verb here names an element and a move, which is the whole
     * reason the language is safe: the action space is a handful of verbs over
     * elements that must already exist on an allowlisted page. A goal names
     * neither, and the runner works the moves out at run time by reading the
     * page and choosing from what is on it (agent.js).
     *
     * That does not widen the action space, and the distinction is the point.
     * A goal is not an escape hatch into "do anything" — it is expanded into
     * these same verbs against these same elements, through the same
     * `validate()`, and every move it makes is reported as its own line. What
     * it buys is a test that survives the page being redesigned, which a
     * recorded click does not.
     *
     * The text is a sentence, and the punctuation it may not contain is the
     * punctuation the document format uses: a quote, a pipe, a semicolon or a
     * newline in an edge label is a case that no longer parses. Better to
     * refuse it at the door than to write a file that cannot be read back.
     */
    op: 'goal',
    syntax: [{ re: /^goal\s+(.+)$/i, ir: (m) => ({ text: unq(m[1]) }) }],
    show: (s) => `goal '${s.text}'`,
    label: (s, t) => `goal ${t(s.text, 16)}`,
    // Its own words, because they were written to be read by a person in the
    // first place — a goal that needed rephrasing was badly written. Only the
    // first letter is touched, so it reads as the sentence it is beside every
    // other step's ("Click the first 'Blog' link").
    say: (s) => { const t = String(s.text ?? ''); return t ? t[0].toUpperCase() + t.slice(1) : t; },
    check: (s) => {
      const text = typeof s.text === 'string' ? s.text.trim() : '';
      if (!text) return 'a goal needs a sentence saying what to achieve';
      if (text.length > GOAL_MAX) return `a goal is one sentence — at most ${GOAL_MAX} characters, not ${text.length}`;
      if (/['"`|;\n]/.test(text)) return 'a goal may not contain a quote, a pipe, a semicolon or a newline — the document format uses them';
      return true;
    },
  },

  // ------------------------------------------------------------- assertions

  {
    op: 'expect',
    assert: 'valueEquals',
    syntax: [{
      re: /^check\s+(.+?)\s+is\s+(.+)$/i,
      ir: (m) => ({ target: target(m[1]), ...value(m[2]) }),
    }],
    // Written back as a LENGTH, not as the text: the value may have come from
    // the vault, and a script is a thing people paste into tickets.
    show: (s) => `check ${showTarget(s.target)} is ${String(s.value).length} chars`,
    label: (s, t) => `${t(s.target, 8)} = ${String(s.value).length} chars`,
    say: (s) => `Check ${sayTarget(s.target)} holds ${String(s.value).length} characters`,
  },
  {
    op: 'expect',
    assert: 'atTop',
    syntax: [{ re: /^check\s+at\s+top$/i, ir: () => ({}) }],
    show: () => 'check at top',
    label: () => 'at top of page',
    say: () => 'Check the page is scrolled to the top',
  },
  {
    // What the last navigation did, which the final URL cannot tell you: a
    // friendly 404 has a perfectly good URL, and so does a link that 301s
    // through a path nobody maintains.
    op: 'expect',
    assert: 'status',
    syntax: [{ re: /^check\s+status\s+(\d{3})$/i, ir: (m) => ({ value: Number(m[1]) }) }],
    show: (s) => `check status ${s.value}`,
    label: (s) => `HTTP ${s.value}`,
    say: (s) => `Check the page answered ${s.value}`,
  },
  {
    op: 'expect',
    assert: 'redirects',
    syntax: [
      { re: /^check\s+no\s+redirects?$/i, ir: () => ({ value: 0 }) },
      { re: /^check\s+(\d+)\s+redirects?$/i, ir: (m) => ({ value: Number(m[1]) }) },
    ],
    show: (s) => (s.value === 0 ? 'check no redirect' : `check ${s.value} redirects`),
    label: (s) => (s.value === 0 ? 'no redirect' : `${s.value} redirects`),
    say: (s) => (s.value === 0 ? 'Check it went straight there, with no redirect' : `Check it redirected ${s.value === 1 ? 'once' : s.value === 2 ? 'twice' : `${s.value} times`}`),
  },
  {
    op: 'expect',
    assert: 'via',
    syntax: [{ re: /^check\s+redirect\s+via\s+(.+)$/i, ir: (m) => ({ value: unq(m[1]) }) }],
    show: (s) => `check redirect via '${s.value}'`,
    label: (s, t) => `via ${t(s.value, 14)}`,
    say: (s) => `Check it went through "${s.value}"`,
  },
  {
    op: 'expect',
    assert: 'textVisible',
    syntax: [{ re: /^see\s+(.+)$/i, ir: (m) => ({ value: unq(m[1]) }) }],
    show: (s) => `see '${s.value}'`,
    say: (s) => `Check "${s.value}" is on the page`,
    label: (s, t) => `text: ${t(s.value, 12)}`,
  },
  {
    // Arriving somewhere is written as a node shape, not an edge action, so
    // this row has no `syntax` and never writes itself back into a label.
    op: 'expect',
    assert: 'urlContains',
    syntax: [],
    show: () => null,
    label: (s, t) => `url ~ ${t(s.value, 12)}`,
    say: (s) => `Check the address contains "${s.value}"`,
  },
  {
    // Likewise: the entry node is the goto.
    op: 'goto',
    syntax: [],
    show: () => null,
    label: (s, t) => `▶ ${t(s.url, 54)}`,
    say: (s) => `Open ${s.url}`,
  },
];

// ------------------------------------------------------------------ the API

const key = (op, assert) => (assert ? `${op}:${assert}` : op);
const BY_KEY = new Map(VERBS.map((v) => [key(v.op, v.assert), v]));

/** Every op name the language knows — what ops.js must supply a runner for. */
export const OP_NAMES = [...new Set(VERBS.map((v) => v.op))];

/** The row that describes a step, or undefined if nothing does. */
export const verbFor = (step) => BY_KEY.get(key(step?.op, step?.assert));

/**
 * One clause of an edge label -> one IR step.
 *
 * Mermaid is permissive; this runner must not be. An unreadable action is a
 * hard error, never a silently skipped step — otherwise a typo passes.
 */
export function parseAction(clause) {
  const s = String(clause ?? '').trim();
  if (!s) return null;

  for (const v of VERBS) {
    for (const { re, ir } of v.syntax) {
      const m = s.match(re);
      if (m) return { op: v.op, ...(v.assert ? { assert: v.assert } : {}), ...ir(m) };
    }
  }
  throw new Error(`Unreadable edge action "${s}"`);
}

/**
 * One IR step -> how it is written. `null` means "this one is a node, not an
 * edge action" — the two url/text assertions and the goto.
 *
 * A step whose op is not in the table is an error rather than a `null`: being
 * quietly dropped from a script you are about to trust is worse than a stop.
 */
export function showAction(step) {
  const v = verbFor(step);
  if (!v) throw new Error(`No way to write "${key(step?.op, step?.assert)}" back as text`);
  return v.show(step);
}

/**
 * One IR step -> its label in a diagram. `trunc` is supplied by the caller
 * because only the caller knows the budget for the shape it is drawing.
 */
export function labelAction(step, trunc) {
  const v = verbFor(step);
  return v ? v.label(step, trunc) : trunc(step.op, 24);
}

/** True, or the reason this step is not valid. Shape only — see ops.js for the rest. */

/**
 * A target, as a sentence names it: `nth1/link:Blog` is 'the first "Blog"
 * link', `navigation/link:Pricing` is 'the "Pricing" link in the navigation'.
 *
 * The script form is exact and the reader has to know the grammar. This is for
 * somebody watching a run who does not, and who wants to know what the thing
 * is about to do — so it spends words rather than saving them.
 */
/**
 * What a step types, said plainly. `$TODO` is not a key — it is what the
 * recorder writes when it refused to keep a password, and the run fails on it
 * until somebody maps it. Saying "the saved TODO" made it read like a key
 * called TODO; this says what it actually is.
 */
const sayValue = (s) => {
  if (!s.valueRef) return `"${s.value}"`;
  const key = String(s.valueRef).replace(/^secrets\./, '');
  return key === 'TODO' ? 'the password (not captured yet — give it a vault key)' : `the saved ${key}`;
};

export function sayTarget(target) {
  const raw = String(target ?? '');
  const i = raw.indexOf(':');
  if (i < 0) return raw ? `"${raw}"` : 'it';
  const head = raw.slice(0, i);
  const name = raw.slice(i + 1);
  const [scope, role] = head.includes('/') ? [head.slice(0, head.indexOf('/')), head.slice(head.indexOf('/') + 1)] : [null, head];
  const nth = /^nth(\d+)$/.exec(scope ?? '');
  const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
  const which = nth ? `${ORDINAL[Number(nth[1])] ?? `${nth[1]}th`} ` : '';
  // What a person would call it. A label or a placeholder names a field; text
  // is words on the page rather than a control.
  const WORD = { link: 'link', button: 'button', textbox: 'field', searchbox: 'search box', checkbox: 'checkbox',
    radio: 'radio button', combobox: 'dropdown', menuitem: 'menu item', tab: 'tab', option: 'option',
    label: 'field', placeholder: 'field', heading: 'heading', text: null, switch: 'switch' };
  const word = Object.prototype.hasOwnProperty.call(WORD, role) ? WORD[role] : role;
  const where = scope && !nth ? ` in the ${scope}` : '';
  if (word === null) return `the ${which}text "${name}"${where}`;
  return `the ${which}"${name}" ${word}${where}`;
}

/**
 * One step, in plain English, for somebody watching rather than editing.
 *
 * `showAction` writes the script — exact, round-trips, and assumes the
 * grammar. This writes the sentence. Both come from the same row, so a verb
 * cannot gain a script form and quietly keep an old description.
 */
export function sayAction(step) {
  const row = VERBS.find((v) => v.op === step.op && (v.assert ?? null) === (step.assert ?? null));
  if (!row?.say) return labelAction(step, (t, n) => String(t ?? '').slice(0, n));
  try { return row.say(step); } catch { return labelAction(step, (t, n) => String(t ?? '').slice(0, n)); }
}

export function checkAction(step) {
  const v = verbFor(step);
  if (!v) return `unknown op "${key(step?.op, step?.assert)}"`;
  return v.check ? v.check(step) : true;
}
