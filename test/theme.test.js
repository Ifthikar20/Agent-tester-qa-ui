/**
 * Night mode — the choice, the script that paints it before the app has
 * loaded, the two palettes it switches between, and the screens that have to
 * be able to follow.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { CHOICES, DARK_QUERY, THEME_KEY, nextChoice, parseChoice, resolve } from '../src/theme.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---- the choice

test('a choice is one of three, and anything else follows the device', () => {
  for (const junk of [null, undefined, '', 'Dark', 'auto', 'night']) assert.equal(parseChoice(junk), 'system');
  for (const c of CHOICES) assert.equal(parseChoice(c), c);
  assert.equal(resolve('system', true), 'dark');
  assert.equal(resolve('system', false), 'light');
  assert.equal(resolve('light', true), 'light');
  assert.equal(resolve('dark', false), 'dark');
  assert.equal(resolve('junk', true), 'dark');
});

test("the rail's one button visits all three, and its first press always changes the look", () => {
  for (const systemDark of [false, true]) {
    const seen = [];
    let c = 'system';
    for (let i = 0; i < 3; i++) seen.push((c = nextChoice(c, systemDark)));
    assert.deepEqual([...seen].sort(), [...CHOICES].sort());
    assert.notEqual(resolve(seen[0], systemDark), resolve('system', systemDark));
    assert.notEqual(resolve(seen[1], systemDark), resolve(seen[0], systemDark));
    assert.equal(seen[2], 'system', 'the press that changes nothing on screen comes last');
  }
});

// ---- the boot script, run the way a browser runs it

const BOOT = read('../public/theme-boot.js');

function boot({ saved = null, systemDark = false, storage = 'ok', media = 'ok' } = {}) {
  const attrs = {};
  const meta = { content: 'light dark', setAttribute(k, v) { this[k] = v; } };
  const window = {};
  Object.defineProperty(window, 'localStorage', {
    get() {
      if (storage === 'blocked') throw new Error('SecurityError');     // Chrome with site data blocked
      return { getItem: (k) => (k === THEME_KEY ? saved : null) };
    },
  });
  if (media === 'ok') window.matchMedia = (q) => ({ matches: q === DARK_QUERY && systemDark });
  if (media === 'null') window.matchMedia = () => null;
  const document = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    querySelector: (s) => (s.includes('color-scheme') ? meta : null),
  };
  // A classic script: module syntax in it would throw here, as it would in the page.
  vm.runInNewContext(BOOT, { window, document }, { filename: 'public/theme-boot.js' });
  return { theme: attrs['data-theme'], meta: meta.content };
}

test('the boot script paints what the app would, and never throws', () => {
  for (const saved of [...CHOICES, null, 'junk']) {
    for (const systemDark of [false, true]) {
      const want = resolve(saved, systemDark);
      assert.deepEqual(boot({ saved, systemDark }), { theme: want, meta: want }, `${saved}, device dark: ${systemDark}`);
    }
  }
  assert.equal(boot({ saved: 'dark', storage: 'blocked', systemDark: true }).theme, 'dark');
  assert.equal(boot({ saved: 'dark', storage: 'blocked', systemDark: false }).theme, 'light');
  assert.equal(boot({ saved: 'dark', media: 'missing' }).theme, 'dark');
  assert.equal(boot({ saved: null, media: 'missing' }).theme, 'light');
  assert.equal(boot({ saved: 'system', media: 'null', systemDark: true }).theme, 'light');
});

test('index.html runs it first, and from a file', () => {
  const html = read('../index.html');
  const at = html.indexOf('<script src="/theme-boot.js"></script>');
  assert.ok(at !== -1, 'index.html does not load /theme-boot.js');
  assert.ok(at < html.indexOf('</head>') && at < html.indexOf('type="module"'), 'it has to run before the app and its stylesheet');
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  // The runner's CSP refuses inline script, and `vite dev` sends no CSP to notice.
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
});

// ---- the palettes

const CSS = read('../src/app.css').replace(/\/\*[\s\S]*?\*\//g, '');

function colours(prelude) {
  const m = CSS.match(new RegExp(`${prelude}\\s*\\{([^{}]*)\\}`));
  assert.ok(m, `app.css has no ${prelude} block`);
  const out = {};
  for (const [, name, value] of m[1].matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)) {
    assert.match(value.trim(), /^#[0-9a-f]{6}$/i, `--color-${name}: this guard reads six-digit hex`);
    out[name] = value.trim();
  }
  return out;
}

const LIGHT = colours('@theme');
const NIGHT = colours(':root\\[data-theme="dark"\\]');
const DARK = { ...LIGHT, ...NIGHT };
/** The same by day and by night, on purpose: the accent fill and its hover, and the console stage's navy. */
const SHARED = new Set(['brand', 'brand-deep', 'night', 'night-2', 'night-line']);

test('every colour has a night value, or is shared on purpose', () => {
  for (const n of Object.keys(NIGHT)) {
    assert.ok(n in LIGHT && !SHARED.has(n), `--color-${n} in the night block: a typo, or it is listed as shared`);
  }
  assert.deepEqual(Object.keys(LIGHT).filter((n) => !SHARED.has(n) && !(n in NIGHT)), [], 'these have no night value');
});

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (c) => { const [r, g, b] = c.map(linear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** `bg-x/10`: the colour at 10% over what is behind it, composited in sRGB. */
const over = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

// Machado, Oliveira & Fernandes (2009), deuteranopia at full severity, applied
// in linear sRGB; the distance is OKLab's, times 100.
const DEUTAN = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]];
const oklab = ([r, g, b]) => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
};
const deutan = (hex) => {
  const v = rgb(hex).map(linear);
  return oklab(DEUTAN.map(([a, b, c]) => Math.min(1, Math.max(0, a * v[0] + b * v[1] + c * v[2]))));
};
const apart = (a, b) => {
  const p = deutan(a);
  const q = deutan(b);
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

test('the colourblind distance is the one app.css quotes', () => {
  assert.equal(apart('#8b8983', '#d03b3b').toFixed(1), '9.4');
  assert.equal(apart('#0ca30c', '#d03b3b').toFixed(1), '4.1');
});

const CODE = Object.keys(LIGHT).filter((n) => n.startsWith('code-'));
const TEXT = ['ink', 'ink-2', 'ink-3', 'brand-2', 'fail', 'critical', 'warn', 'good', ...CODE];

function pairs(T) {
  const c = (n) => rgb(T[n]);
  const white = rgb('#ffffff');
  return [
    ...TEXT.flatMap((n) => ['ground', 'panel'].map((s) => [`${n} text on ${s}`, c(n), c(s), 4.5])),
    ...['good', 'warn', 'critical'].map((n) => [`${n} pill on panel`, c(n), over(c(n), 0.1, c('panel')), 4.5]),
    ['brand-2 on brand-50', c('brand-2'), c('brand-50'), 4.5],
    ['on-ink on ink', c('on-ink'), c('ink'), 4.5],
    ['on-critical on critical', c('on-critical'), c('critical'), 4.5],
    ['white on brand', white, c('brand'), 4.5],
    ['white on brand-deep', white, c('brand-deep'), 4.5],
    ...['pass', 'fail'].map((n) => [`${n} chart mark on panel`, c(n), c('panel'), 3]),
    ...['ground', 'panel'].map((s) => [`focus ring on ${s}`, c('brand'), c(s), 3]),
  ];
}

/**
 * Pairs the day palette already fails on main (6fb16f5). Night mode does not
 * repaint the day, so these are a floor rather than a pass: none may get worse,
 * and one that starts passing has to come off the list.
 */
const LIGHT_DEBT = {
  'warn text on ground': 4.26, 'warn text on panel': 4.40,
  'good text on ground': 3.24, 'good text on panel': 3.35,
  'good pill on panel': 2.99, 'warn pill on panel': 3.89, 'critical pill on panel': 4.17,
};

for (const [name, T, debt] of [['day', LIGHT, LIGHT_DEBT], ['night', DARK, {}]]) {
  test(`every ${name} pair reads, and a pass and a failure stay apart`, () => {
    for (const [label, fg, bg, min] of pairs(T)) {
      const r = contrast(fg, bg);
      if (label in debt) {
        assert.ok(r >= debt[label] - 0.005, `${name}: ${label} got worse, ${r.toFixed(2)}:1`);
        assert.ok(r < min, `${name}: ${label} passes now — take it off LIGHT_DEBT`);
      } else {
        assert.ok(r >= min, `${name}: ${label} is ${r.toFixed(2)}:1, needs ${min}:1`);
      }
    }
    assert.ok(apart(T.pass, T.fail) >= 8, `${name}: pass and fail merge under deuteranopia`);
  });
}

// ---- the screens

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
/** The landing page keeps its own palette and is not themed (App.vue). */
const UNTHEMED = /^(views[\\/]LandingView\.vue|components[\\/]landing[\\/])/;
const PALETTE = /\b(?:bg|text|border|ring|fill|stroke|divide|outline|from|via|to|shadow|accent|caret|decoration|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

test('no screen paints with a colour night mode cannot reach', () => {
  const files = readdirSync(SRC, { recursive: true }).filter((f) => /\.(vue|js)$/.test(f) && !UNTHEMED.test(f));
  assert.ok(files.length > 20, `found only ${files.length} source files`);
  const bad = [];
  for (const f of files) {
    readFileSync(SRC + f, 'utf8').split('\n').forEach((line, i) => {
      const at = `src/${f.replace(/\\/g, '/')}:${i + 1}`;
      if (PALETTE.test(line)) bad.push(`${at}: a Tailwind palette colour has no night value; use a token`);
      if (/\bbg-brand-2\b/.test(line)) bad.push(`${at}: brand-2 is the text shade and turns light at night; fill with brand-deep`);
      // Each quoted run separately, so a ternary's branches are not read as one class list.
      for (const run of line.split(/["'`]/)) {
        const words = run.split(/\s+/);
        if (words.includes('bg-ink') && words.includes('text-white')) bad.push(`${at}: white on ink is white on white at night; use text-on-ink`);
      }
    });
  }
  assert.deepEqual(bad, []);
});
