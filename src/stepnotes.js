/**
 * What the runner worked out about each step of a recording, as it was made.
 *
 * The runner reads the page after every recorded step and — when this
 * organisation's AI fixes are on — asks the AI what the step did and whether it
 * is a mistake of the recording: a press inside another site's frame, the same
 * button pressed again with nothing changing, a credential typed as plain text.
 * It says so as `record.notes`: a step being read is "Thinking…", a read step
 * has its one line, and a concern may offer one fix — taking the step out —
 * which goes back to the runner only when a person presses it.
 *
 * PURE. Notes come under the recording's revision, and notes from another
 * revision are not drawn: once a step is taken out, every step after it moves.
 */

/** Each concern, as the label in front of what the note says. */
export const CONCERN_LABELS = {
  in_frame: 'Inside a frame', repeated: 'Repeated', opens_new_tab: 'Opens a new tab',
  wrong_element: 'Maybe the wrong element', typed_private_value: 'Typed as plain text', unclear: 'Looks wrong',
};

/** The fixes a note may offer, as their buttons say them. */
export const FIX_LABELS = { remove_step: 'Remove step' };

export const concernLabel = (kind) => CONCERN_LABELS[kind] ?? 'Looks wrong';
export const fixLabel = (fix) => FIX_LABELS[fix] ?? null;

const isNote = (n) => Boolean(n) && typeof n === 'object' && Number.isInteger(n.i) && n.i >= 0;
const notesOf = (v) => (Array.isArray(v) ? v.filter(isNote) : []);

/** The notes by step index — what a list of steps looks each step up in. */
export function notesByIndex(notes) {
  const out = new Map();
  for (const n of notesOf(notes)) out.set(n.i, n);
  return out;
}

/**
 * The store's rule for the two events, on `{ rev, notes }`: a `recorded` event
 * is a new revision and brings that revision's notes; `record.notes` replaces
 * the notes only when it is about the revision on screen. Anything else, or a
 * runner too old to send a revision, leaves it as it was.
 */
export function notesOn(state, ev) {
  if (!ev) return state;
  if (ev.t === 'recorded' && typeof ev.rev === 'number') return { rev: ev.rev, notes: notesOf(ev.notes) };
  if (ev.t === 'record.notes' && typeof ev.rev === 'number' && ev.rev === state?.rev) return { rev: ev.rev, notes: notesOf(ev.notes) };
  return state;
}

export const isThinking = (note) => note?.state === 'thinking';

/** The fix a note offers, as `{ fix, label }` — or null when it offers none. */
export function offeredFix(note) {
  const fix = note?.concern?.fix;
  const label = fixLabel(fix);
  return label ? { fix, label } : null;
}

/** What goes back to the runner to apply a note's fix: on the revision it was offered on, and no other. */
export const fixMessage = (note, rev) => ({ t: 'record.fix', i: note.i, rev, fix: note.concern.fix });

/** How many steps are being read right now, and how many say something is wrong — the recording's header. */
export const thinkingCount = (notes) => notesOf(notes).filter(isThinking).length;
export const concernCount = (notes) => notesOf(notes).filter((n) => n.concern).length;
