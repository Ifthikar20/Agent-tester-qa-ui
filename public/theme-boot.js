/*
 * Put the theme on <html> before the first paint, so a viewer who chose dark
 * never sees a white frame first. main.js does not mount until the first
 * navigation resolves, which can take seconds, and a theme applied from Vue
 * would flash light for all of that time.
 *
 * A classic script served from public/, deliberately:
 *   - not inline, because the runner's Content-Security-Policy refuses inline
 *     script (poc-qa-stack-backend mode.js csp(), held there by
 *     scripts/check-auth.js);
 *   - not a module, because modules wait until the document has been parsed,
 *     by which time the page may already have painted.
 *
 * It also narrows <meta name="color-scheme"> to the scheme chosen, so the
 * canvas a browser paints before any stylesheet arrives is already the right
 * colour — the device's preference alone is not the viewer's choice.
 *
 * Keep in step with resolve() in src/theme.js: test/theme.test.js runs this
 * file against it for every combination.
 */
(function () {
  var saved = null;
  var dark = false;
  try { saved = window.localStorage.getItem('gc.theme'); } catch (e) { /* blocked storage throws */ }
  if (saved === 'light' || saved === 'dark') {
    dark = saved === 'dark';
  } else {
    try { dark = !!window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { dark = false; }
  }
  var theme = dark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', theme);
})();
