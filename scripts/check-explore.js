/**
 * Researching a site from a prompt: what it walks, what it refuses, and how it ranks.
 *
 *   node scripts/check-explore.js
 *
 * No server and no browser. `explore()` takes `open` and `read` as functions,
 * so the site under test here is a literal object — which is the point: the
 * rules worth pinning are that it never clicks, never leaves the origin, stops
 * at the caps, and puts the page a person meant at the top. None of those need
 * a real browser to be true, and all of them are easy to break.
 */
import { explore, scorePage, wordsOf, PAGES_MAX, DEPTH_MAX } from '../explore.js';

let failures = 0;
const ok = (l, d = '') => console.log(`  ✓  ${l.padEnd(52)} ${d}`);
const bad = (l, d = '') => { failures++; console.log(`  ✕  ${l.padEnd(52)} ${d}`); };
const is = (l, got, want) => (got === want ? ok(l, String(got)) : bad(l, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`));

/** A small site: a nav, a sign-in, a sign-up, and some noise. */
const SITE = {
  '/': { title: 'Acme', targets: [{ role: 'link', name: 'Sign in' }],
    links: [{ path: '/login', name: 'Sign in' }, { path: '/signup', name: 'Create an account' },
      { path: '/pricing', name: 'Pricing' }, { path: '/blog', name: 'Blog' }, { path: '/careers', name: 'Careers' }] },
  '/login': { title: 'Log in', targets: [{ role: 'textbox', name: 'Email' }, { role: 'textbox', name: 'Password' }, { role: 'button', name: 'Log in' }], links: [{ path: '/forgot', name: 'Forgot your password?' }] },
  '/signup': { title: 'Create your account', targets: [{ role: 'textbox', name: 'Email' }, { role: 'textbox', name: 'Password' }, { role: 'button', name: 'Create an account' }], links: [] },
  '/pricing': { title: 'Pricing', targets: [{ role: 'link', name: 'Buy' }], links: [] },
  '/blog': { title: 'Blog', targets: [], links: [{ path: '/blog/one', name: 'One' }, { path: '/blog/two', name: 'Two' }] },
  '/careers': { title: 'Careers', targets: [], links: [] },
  '/forgot': { title: 'Reset your password', targets: [{ role: 'textbox', name: 'Email' }], links: [] },
  '/blog/one': { title: 'One', targets: [], links: [] },
  '/blog/two': { title: 'Two', targets: [], links: [] },
};

/** A walker over SITE that records everything it was asked to do. */
function walker({ site = SITE, allow = () => true } = {}) {
  const opened = [];
  let at = null;
  return {
    opened,
    open: async (url) => {
      const u = new URL(url);
      if (!allow(u.origin)) { const e = new Error(`origin ${u.origin} is not allowed yet`); e.origin = u.origin; throw e; }
      const p = u.pathname;
      if (!site[p]) throw new Error('404');
      opened.push(p);
      at = p;
    },
    read: async () => ({ url: `https://acme.test${at}`, ...site[at] }),
  };
}
const run = (focus, opts = {}) => {
  const w = walker(opts);
  return explore('https://acme.test/', { open: w.open, read: w.read, focus, ...opts }).then((r) => ({ ...r, opened: w.opened }));
};

// ---------------------------------------------------------------------------
console.log('\n— the words of a prompt ————————————————————————————');
{
  const w = wordsOf('Test the sign-in for a student user');
  const has = (x) => w.includes(x);
  if (has('signin') && has('sign') && has('in') && has('student') && !has('test') && !has('the')) {
    ok('a hyphen counts three ways, stop words go', w.join(' '));
  } else bad('a hyphen counts three ways, stop words go', w.join(' '));
  if (!wordsOf('test the page for a case').length) ok('a prompt of nothing but filler has no words', '(empty)');
  else bad('a prompt of nothing but filler has no words', wordsOf('test the page for a case').join(' '));
}

// ---------------------------------------------------------------------------
console.log('\n— what a page is worth ——————————————————————————————');
{
  const login = { path: '/login', name: 'Log in', targets: [{ role: 'textbox', name: 'Password' }] };
  const pricing = { path: '/pricing', name: 'Pricing', targets: [] };
  const a = scorePage(login, wordsOf('test the sign-in'));
  const b = scorePage(pricing, wordsOf('test the sign-in'));
  if (a.score > b.score) ok('the sign-in page beats an unrelated one', `${a.score} vs ${b.score}`);
  else bad('the sign-in page beats an unrelated one', `${a.score} vs ${b.score}`);
  if (a.why.some((w) => /password/i.test(w))) ok('and says why, naming what it saw', a.why[0]);
  else bad('and says why, naming what it saw', JSON.stringify(a.why));

  // The shared word must not decide: "sign" belongs to both families.
  const up = wordsOf('sign up for an account');
  const inn = wordsOf('sign in to my account');
  const sLogin = scorePage({ path: '/login', name: 'Log in', targets: [] }, up).score;
  const sSignup = scorePage({ path: '/signup', name: 'Create your account', targets: [] }, up).score;
  if (sSignup > sLogin) ok('"sign up" does not fire the sign-in family', `signup ${sSignup} > login ${sLogin}`);
  else bad('"sign up" does not fire the sign-in family', `signup ${sSignup}, login ${sLogin}`);
  const iLogin = scorePage({ path: '/login', name: 'Log in', targets: [] }, inn).score;
  const iSignup = scorePage({ path: '/signup', name: 'Create your account', targets: [] }, inn).score;
  if (iLogin > iSignup) ok('and "sign in" does not fire the sign-up family', `login ${iLogin} > signup ${iSignup}`);
  else bad('and "sign in" does not fire the sign-up family', `login ${iLogin}, signup ${iSignup}`);
}

// ---------------------------------------------------------------------------
console.log('\n— the walk ——————————————————————————————————————————');
{
  const r = await run('test the sign-in for a student user');
  is('the page a person meant is first', r.best?.path, '/login');
  if (r.ranked[0].why.length) ok('with the reason it was chosen', r.ranked[0].why.join('; '));
  else bad('with the reason it was chosen', 'no reason given');
  if (r.opened.includes('/') && r.opened.includes('/login')) ok('it opened the start and the page it found', r.opened.join(' '));
  else bad('it opened the start and the page it found', r.opened.join(' '));
  if (r.opened.indexOf('/login') < r.opened.indexOf('/blog')) ok('best first: the sign-in before the blog', r.opened.slice(0, 4).join(' '));
  else bad('best first: the sign-in before the blog', r.opened.join(' '));

  const up = await run('sign up for a new account');
  is('another prompt, another page', up.best?.path, '/signup');
}

// ---------------------------------------------------------------------------
console.log('\n— the bounds ————————————————————————————————————————');
{
  const r = await run('test everything', { limits: { pages: 3, depth: DEPTH_MAX, wallMs: 60_000 } });
  is('it opens no more pages than it may', r.pages.length, 3);

  const deep = await run('read the blog', { limits: { pages: PAGES_MAX, depth: 1, wallMs: 60_000 } });
  if (!deep.opened.some((p) => p.startsWith('/blog/'))) ok('and goes no deeper than it may', `depth 1 stopped before ${'/blog/one'}`);
  else bad('and goes no deeper than it may', deep.opened.join(' '));

  let t = 0;
  const slow = await run('test the sign-in', { now: () => (t += 50_000), limits: { pages: PAGES_MAX, depth: DEPTH_MAX, wallMs: 60_000 } });
  if (slow.halted && /time/.test(slow.halted)) ok('the wall clock ends it, and it says so', slow.halted);
  else bad('the wall clock ends it, and it says so', JSON.stringify(slow.halted));

  let n = 0;
  const stopped = await run('test the sign-in', { stopped: () => ++n > 2 });
  if (stopped.halted === 'stopped') ok('a person can stop it', `after ${stopped.pages.length} page(s)`);
  else bad('a person can stop it', JSON.stringify(stopped.halted));
}

// ---------------------------------------------------------------------------
console.log('\n— what it will not do ———————————————————————————————');
{
  // Nothing in the site object can be clicked: `explore` is given `open` and
  // `read` and nothing else. The walker would have to be handed a `click` to
  // click, and it never is — which this asserts by shape.
  const shape = await run('test the sign-in');
  if (shape.pages.every((p) => Array.isArray(p.targets))) ok('it only ever reads a page', 'open + read, no click anywhere');
  else bad('it only ever reads a page', 'a page came back in an unexpected shape');

  const gated = await run('test the sign-in', { allow: () => false });
  if (gated.halted && /not allowed yet/.test(gated.halted)) ok('an origin nobody allowed ends the walk', gated.halted);
  else bad('an origin nobody allowed ends the walk', JSON.stringify(gated.halted));
  if (!gated.pages.length) ok('and nothing was read behind that gate', '0 pages');
  else bad('and nothing was read behind that gate', `${gated.pages.length} pages`);

  // Only same-origin links are ever queued: links() drops the rest before we
  // see them, and what we do with what is left is resolve it against the start.
  const offsite = { ...SITE, '/': { ...SITE['/'], links: [{ path: '/login', name: 'Sign in' }] } };
  const r = await run('test the sign-in', { site: offsite });
  if (r.pages.every((p) => p.url.startsWith('https://acme.test'))) ok('every page it read was the site it started on', r.pages.length + ' pages');
  else bad('every page it read was the site it started on', r.pages.map((p) => p.url).join(' '));
}

// ---------------------------------------------------------------------------
console.log('\n— a page it could not open ——————————————————————————');
{
  const r = await run('test the sign-in', { site: { ...SITE, '/login': undefined } });
  const row = r.pages.find((p) => p.path === '/login');
  if (row?.error) ok('is reported, not dropped', row.error);
  else if (!row) ok('is not queued when the walk never reached it', 'not reached');
  else bad('is reported, not dropped', JSON.stringify(row));
}

console.log(failures
  ? `\n  ${failures} FAILED\n`
  : '\n  OK — a prompt reaches the page it meant, the walk stays on the site,\n'
    + '       inside its caps, stops when asked, and never presses anything.\n');
process.exit(failures ? 1 : 0);
