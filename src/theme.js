/**
 * Light, dark, or whatever this device prefers — decided in one place.
 *
 * The choice belongs to the person at this browser, not to the deployment, so
 * it is kept beside the sidebar's state (stores/ui.js) under `gc.theme`.
 * "system" is the default, and anything unreadable counts as "system" too: a
 * value from a later version, or a key someone edited by hand, must never
 * strand a viewer in a theme they did not pick.
 *
 * public/theme-boot.js repeats `resolve()` in a few lines of ES5. It has to run
 * before the stylesheet paints, so it can import nothing, and the runner's
 * Content-Security-Policy refuses inline script, so it cannot live in
 * index.html either. test/theme.test.js runs that file against this one for
 * every combination, which is what stops the two copies drifting apart.
 */

export const THEME_KEY = 'gc.theme';
export const CHOICES = ['light', 'dark', 'system'];
export const LABEL = { light: 'Light', dark: 'Dark', system: 'System' };
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function parseChoice(raw) {
  return CHOICES.includes(raw) ? raw : 'system';
}

/** The theme actually drawn: 'light' or 'dark'. */
export function resolve(choice, systemDark) {
  const c = parseChoice(choice);
  if (c === 'system') return systemDark ? 'dark' : 'light';
  return c;
}

/**
 * Where the collapsed sidebar's single button goes next.
 *
 * Three choices over two looks means one press in the cycle changes nothing on
 * screen — "system" looks exactly like one of the other two. That press is made
 * the last, never the first: from "system" the button goes to the look the
 * device is NOT showing, so a press always visibly does something before it
 * quietly returns to following the device.
 */
export function nextChoice(choice, systemDark) {
  const here = resolve('system', systemDark);
  const there = here === 'dark' ? 'light' : 'dark';
  const c = parseChoice(choice);
  return c === 'system' ? there : c === there ? here : 'system';
}
