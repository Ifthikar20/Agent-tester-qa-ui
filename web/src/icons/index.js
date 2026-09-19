/**
 * The app's icons, looked up by name.
 *
 * Drop `console.png` into this folder and every `<Icon name="console" />` in
 * the app draws it. There is no list to add the file to and no component to
 * edit, because the folder IS the list — which is the whole point: a designer
 * should be able to redraw the sidebar without opening a .vue file, and a
 * mechanism that needs a line of code per icon is a mechanism that will be one
 * icon out of date by the second week.
 *
 * Four file names are understood, and only the first is required:
 *
 *   console.png          the icon
 *   console@2x.png       the same drawing at twice the pixels, for a dense screen
 *   console.dark.png     what to show while the app is in its dark theme
 *   console.dark@2x.png  …and that one at twice the pixels
 *
 * A name with no PNG at all falls back to the line art in GLYPHS below, so the
 * nav is never full of holes while a set is half drawn, and a name with neither
 * simply draws nothing rather than a broken image.
 *
 * Here rather than in public/, for three reasons. scripts/start.js rebuilds
 * when anything under web/src is newer than the build, so a dropped file is
 * picked up by the next `npm start` on its own; the bundler hashes the name, so
 * a redrawn icon is a new URL rather than a cache someone has to know to bust;
 * and the build KNOWS which of the four forms exist, where a public/ URL would
 * have to be guessed at and every icon without a dark variant would cost a 404
 * in the console on every load.
 */

/**
 * The fallback line art, at 16×16 and one stroke width, drawn inline rather
 * than pulled from a font.
 *
 * A whole icon library is 40kB to render nine glyphs, and every one of them
 * would still need aria-hiding — the label beside it is the accessible name,
 * and a second copy of it read aloud is noise.
 */
export const GLYPHS = {
  suite:   'M3 5.5h10M3 8h10M3 10.5h6',
  history: 'M8 4.2v4l2.6 1.6M2.6 8a5.4 5.4 0 1 0 1.6-3.8',
  console: 'M2.5 3.5h11v9h-11zM5 7l1.8 1.6L5 10.2M8.8 10.4h2.6',
  defects: 'M8 2.6 14.2 13H1.8zM8 6.4v3.1M8 11.3v.5',
  settings:'M8 5.9a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2M8 2.3l1 1.5 1.8-.3.5 1.7 1.6.8-.6 1.7.9 1.6-1.4 1.1v1.8l-1.8.2-1 1.5L8 13l-1 .9-1-1.5-1.8-.2v-1.8L2.8 9.3l.9-1.6-.6-1.7 1.6-.8.5-1.7L7 3.8z',
  security:'M8 2.2 3.2 4v4c0 2.9 2 5 4.8 5.8 2.8-.8 4.8-2.9 4.8-5.8V4zM6 8l1.4 1.4L10.2 6.6',
  org:     'M5.5 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10.5 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2 13c0-2 1.6-3.3 3.5-3.3S9 11 9 13M7.5 13c0-2 1.3-3.3 3-3.3S14 11 14 13',
  monitor: 'M1.5 8.5h2.8l1.6-4.2 2.4 7.4 2-5 1.3 1.8h3',
  chat:    'M2.5 3h11v7.5H7.5L4.5 13v-2.5h-2z',
  // The chat's suggestion tiles (views/ChatView.vue): a list, a run, a draft.
  list:    'M5.5 4.5h8M5.5 8h8M5.5 11.5h8M2.5 4.5h.01M2.5 8h.01M2.5 11.5h.01',
  play:    'M4.5 2.8v10.4L13 8z',
  spark:   'M8 2.2l1.5 4.3L13.8 8l-4.3 1.5L8 13.8l-1.5-4.3L2.2 8l4.3-1.5z',
  // The chat's files and charts: the paperclip on the composer, the agents that read a file, translate code, draw a chart.
  paperclip: 'M13 7.5l-5.2 5.2a3 3 0 0 1-4.3-4.3L9 3a2 2 0 0 1 2.9 2.9L6.6 11.2a1 1 0 0 1-1.5-1.5l4.8-4.8',
  code:    'M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5M9.2 3 6.8 13',
  chart:   'M2.5 13.5h11M4.5 11V7.5M8 11V4M11.5 11V9',
};

/**
 * Every PNG in this folder, resolved at build time.
 *
 * Eager, because the alternative is nine promises the first render would have
 * to wait on, and the sidebar draws immediately. `query: '?url'` rather than
 * the old `as: 'url'`, which Vite 8 removed: these are files to fetch, not
 * modules to run.
 */
const files = import.meta.glob('./*.png', { eager: true, import: 'default', query: '?url' });

/** name → { light | dark } → { '1x' | '2x' } → the hashed URL. */
const PNG = {};
for (const [path, url] of Object.entries(files)) {
  const m = /([^/]+?)(\.dark)?(@2x)?\.png$/.exec(path);
  if (!m) continue;
  const [, name, dark, retina] = m;
  const variants = (PNG[name] ??= {});
  const theme = (variants[dark ? 'dark' : 'light'] ??= {});
  theme[retina ? '2x' : '1x'] = url;
}

/** What was dropped in for this name, or null if it is still line art. */
export const png = (name) => PNG[name] ?? null;
