/**
 * Researching a site, so a prompt can become a test.
 *
 * "Test the sign-in for a student user" names no page. Somebody has to open
 * the site, find out which of its pages is the sign-in, and only then draft
 * something. Until now nothing here followed a link: `links()` reads the
 * anchors on the page that is already open, and a person clicked the
 * suggestions to reach a second one.
 *
 * This walks, breadth first, and it walks under three rules that are not
 * negotiable:
 *
 *   It never clicks anything. Exploration navigates by address only. A crawler
 *   that presses buttons on somebody's site to see what they do is a crawler
 *   that eventually presses "Delete account" — so the only thing it does to a
 *   page is read it. Every side effect a site has is behind a control, and it
 *   touches no controls.
 *
 *   It never leaves the origin. `links()` drops cross-origin anchors already,
 *   and every navigation goes through `OPS.goto`, which means `checkUrl` and
 *   the organisation's allowlist — the same gate a person's Open button passes
 *   through, refusing the same way with the origin on the error.
 *
 *   It is bounded four ways, like every other loop here: pages, depth, a wall
 *   clock, and a stop somebody can press. What it does not reach is reported
 *   as not reached, rather than left out.
 *
 * What comes back is a list of pages, each with what a case could name on it,
 * ranked against the words of the prompt. The ranking is lexical and explains
 * itself; a model is not needed to tell a login page from a pricing page, and
 * a runner that needs one to do that would be a runner that cannot do it when
 * the budget is spent.
 */


/** How many pages one exploration may open. A site is not a corpus. */
export const PAGES_MAX = 12;
/** How far from the start it may get. Two hops reaches a site's own nav and what that nav opens. */
export const DEPTH_MAX = 2;
/** How long one exploration may hold the browser. */
export const WALL_MS = 120_000;
/** Links taken from any one page, so a footer of two hundred cannot flood the frontier. */
export const LINKS_PER_PAGE = 12;

/**
 * What the words of a prompt are worth against the words of a page.
 *
 * A path and an anchor say most of it — `/login`, "Sign in", "Create account"
 * — and the controls the page has say the rest: a page with a password field
 * IS a sign-in page, whatever it calls itself. The weights are small integers
 * on purpose: this orders a dozen pages for a person to confirm, and a score
 * anyone can recompute by eye is worth more here than one they cannot.
 */
const STOP = new Set(['test', 'tests', 'testing', 'check', 'checks', 'run', 'runs', 'page', 'pages', 'case', 'cases',
  'the', 'a', 'an', 'for', 'of', 'on', 'to', 'and', 'or', 'my', 'our', 'this', 'that', 'with', 'as', 'is',
  'flow', 'user', 'users', 'please', 'can', 'you', 'it', 'me', 'we', 'do', 'does', 'go', 'goes']);
// `in` and `up` are NOT filler here, whatever a search engine would say: they
// are the whole difference between signing in and signing up, and dropping
// them sent every registration prompt to the login page.

/**
 * The words of a prompt, lowercased, deduped, the useless ones dropped.
 *
 * A hyphenated word counts three ways — "sign-in" is also "signin" and also
 * "sign" and "in" — because the prompt and the page rarely agree on the
 * punctuation and none of the three spellings should be the one that decides
 * whether a page is found.
 */
export function wordsOf(text) {
  const out = new Set();
  for (const raw of String(text ?? '').toLowerCase().match(/[a-z][a-z0-9-]*/g) ?? []) {
    for (const w of [raw, raw.replace(/-/g, ''), ...raw.split('-')]) {
      if (w.length > 1 && !STOP.has(w)) out.add(w);
    }
  }
  return [...out];
}

/**
 * Words that mean a page is the one a whole family of prompts is about. A
 * prompt says "sign in"; the page says "login". Neither knows the other's
 * word, so the families are written down.
 */
/**
 * `needs` is what the PROMPT must say for the family to be in play: a bare
 * word, or an array meaning all of them together. The pairs matter — "sign"
 * belongs to signing in and to signing up equally, so on its own it chooses
 * neither, and it is "sign" WITH "in" or "sign" WITH "up" that decides. A
 * family that fired on the shared word would rank the login page first for
 * somebody asking about registration.
 */
const FAMILIES = [
  { any: ['signin', 'sign-in', 'login', 'log-in', 'auth', 'authenticate'], needs: ['signin', 'login', 'auth', ['sign', 'in'], ['log', 'in']] },
  { any: ['signup', 'sign-up', 'register', 'registration', 'join', 'create-account'], needs: ['signup', 'register', 'registration', 'join', ['sign', 'up'], ['create', 'account']] },
  { any: ['account', 'profile', 'settings'], needs: ['profile', 'settings', ['my', 'account']] },
  { any: ['checkout', 'cart', 'basket', 'payment', 'billing'], needs: ['checkout', 'cart', 'basket', 'payment', 'billing', 'pay', 'buy'] },
  { any: ['pricing', 'plans'], needs: ['pricing', 'price', 'plan', 'plans'] },
  { any: ['contact', 'support', 'help'], needs: ['contact', 'support', 'help'] },
  { any: ['search'], needs: ['search'] },
  { any: ['dashboard'], needs: ['dashboard'] },
];

/** The roles that say what a page is FOR, when its address does not. */
const TELLS = [
  { role: 'textbox', name: /pass(word)?/i, words: ['sign', 'signin', 'login', 'log', 'in', 'signup', 'register', 'account'], worth: 3 },
  { role: 'textbox', name: /e-?mail|user(name)?/i, words: ['sign', 'signin', 'login', 'signup', 'register', 'account'], worth: 1 },
  { role: 'searchbox', name: /./, words: ['search', 'find'], worth: 3 },
];

/**
 * Score one read page against the words of a prompt, with the reason.
 *
 * @returns {{score:number, why:string[]}}
 */
export function scorePage({ path = '', name = '', targets = [] }, words) {
  const want = new Set(words);
  const slug = `${path} ${name}`.toLowerCase();
  const why = [];
  let score = 0;

  // The address or the link's own words carry a family the prompt asked for.
  const asked = (need) => (Array.isArray(need) ? need.every((w) => want.has(w)) : want.has(need));
  for (const f of FAMILIES) {
    if (!f.needs.some(asked)) continue;
    const hit = f.any.find((a) => slug.includes(a));
    if (hit) { score += 6; why.push(`its address says ${hit}`); }
  }
  // A word of the prompt, said outright.
  for (const w of want) {
    if (w.length > 2 && slug.includes(w)) { score += 2; why.push(`"${w}" is in its address`); }
  }
  // What the page HAS. A password field is the strongest tell there is.
  for (const t of TELLS) {
    if (!t.words.some((w) => want.has(w))) continue;
    const hit = targets.find((x) => x.role === t.role && t.name.test(x.name ?? ''));
    if (hit) { score += t.worth; why.push(`it has a ${hit.role} called "${hit.name}"`); }
  }
  // A control whose own name is one of the prompt's words.
  const named = targets.filter((x) => {
    const n = String(x.name ?? '').toLowerCase();
    return [...want].some((w) => w.length > 3 && n.includes(w));
  });
  if (named.length) { score += Math.min(3, named.length); why.push(`${named.length} control${named.length === 1 ? '' : 's'} named after the request`); }

  return { score, why: [...new Set(why)].slice(0, 3) };
}

const pathOf = (u) => { try { const x = new URL(u); return `${x.pathname}${x.search}`; } catch { return null; } };
/** The same page, ignoring a fragment and a trailing slash: /blog, /blog/ and /blog#top are one page to visit. */
const keyOf = (p) => String(p ?? '').split('#')[0].replace(/\/+$/, '') || '/';

/**
 * Walk the site from one address and read what is there.
 *
 * @param opts.open   async (url) -> void. Navigates, through the origin gate.
 *                    A refusal throws with `.origin` on it, and the walk stops.
 * @param opts.read   async () -> { url, title, targets, links }
 * @param opts.focus  the words of the prompt, for the ranking
 * @param opts.onPage ({ url, path, depth, opened, of }) -> void, per page, for the transcript
 * @param opts.stopped () -> boolean, read between pages
 */
export async function explore(start, {
  open, read, focus = '', onPage = () => {}, stopped = () => false, now = Date.now,
  limits: { pages: pagesMax = PAGES_MAX, depth: depthMax = DEPTH_MAX, wallMs = WALL_MS } = {},
} = {}) {
  const began = now();
  const words = wordsOf(focus);
  const origin = new URL(start).origin;
  const seen = new Set([keyOf(pathOf(start))]);
  const queue = [{ url: start, depth: 0 }];
  const found = [];
  let halted = null;

  while (queue.length && found.length < pagesMax) {
    if (stopped()) { halted = 'stopped'; break; }
    if (now() - began > wallMs) { halted = 'the time one exploration may take was up'; break; }
    const { url, depth } = queue.shift();

    onPage({ url, path: pathOf(url), depth, opened: found.length, of: pagesMax });
    try {
      await open(url);
    } catch (err) {
      // An origin nobody allowed is a decision for a person, and it ends the
      // walk rather than being skipped quietly: the rest of this site is
      // probably behind the same gate.
      if (err?.origin) { halted = `${err.origin} is not allowed yet`; break; }
      found.push({ url, path: pathOf(url), depth, error: err?.message ?? String(err), targets: [], links: [] });
      continue;
    }
    const r = await read().catch(() => null);
    if (!r) { found.push({ url, path: pathOf(url), depth, error: 'the page could not be read', targets: [], links: [] }); continue; }

    const path = pathOf(r.url ?? url) ?? pathOf(url);
    const page = {
      url: r.url ?? url,
      path,
      depth,
      title: r.title ?? '',
      targets: r.targets ?? [],
      links: r.links ?? [],
      error: null,
    };
    // The name a person would know it by: its title, else the last part of its path.
    page.name = (page.title || '').trim() || (path === '/' ? 'Home' : String(path).split('/').filter(Boolean).pop() || path);
    // Scored on what the page IS, never on what it links to. A home page that
    // links to Pricing is not the pricing page, and folding its anchors into
    // its own name ranked every site's front door first for everything.
    Object.assign(page, scorePage({ path, name: page.name, targets: page.targets }, words));
    found.push(page);

    if (depth >= depthMax) continue;
    for (const l of page.links.slice(0, LINKS_PER_PAGE)) {
      const k = keyOf(l.path);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      // The anchor's own words score too, so a link called "Sign in" is
      // visited before a link called "Cookie policy" when there is room for
      // one of them.
      const { score } = scorePage({ path: l.path, name: l.name, targets: [] }, words);
      queue.push({ url: new URL(l.path, origin).href, depth: depth + 1, score });
    }
    // Best first: with a budget of twelve pages, which twelve matters.
    queue.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  const ranked = [...found].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return {
    origin,
    words,
    pages: found,
    ranked,
    best: ranked.find((p) => !p.error && (p.score ?? 0) > 0) ?? null,
    halted,
    ms: now() - began,
  };
}
