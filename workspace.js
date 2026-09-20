/**
 * The workspace: the one name above everything else here.
 *
 * A workspace is the tenant. It owns the projects, the runs, the defects, the
 * monitors, the origin allowlist and the vault — every store in this runner is
 * keyed by it (org.js, docs/AUTH.md §10). What it did not have was a NAME. The
 * key is a slug because it is a path segment, and the UI printed the literal
 * words "Local workspace" wherever a name belonged, which is a hard-coded
 * answer to a question that has a real one.
 *
 * Two sources, and the real one wins. With a control plane, the organisation
 * has a name and members and the runner's copy is ignored — the control plane
 * owns identity and always has. With no control plane there is nobody to ask,
 * and a laptop still deserves to be called what its owner calls it, so the
 * name lives here, beside the rest of that workspace's machine-local state.
 *
 * `owner` is who set it up, in their own words. It is not an account and it
 * proves nothing: with no control plane there are no accounts, and pretending
 * otherwise would be inventing an identity rather than recording a preference.
 * It exists so the product can say "Ada's workspace" instead of guessing.
 *
 * Unnamed is a real and expected state — it is what a runner looks like before
 * anybody has been asked — and `named` says so plainly rather than handing
 * back a placeholder somebody would have to recognise as one.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from './org.js';

/** A name somebody typed, not a slug: spaces, apostrophes and case are all fine. */
export const NAME_MAX = 60;
export const OWNER_MAX = 60;

const now = () => new Date().toISOString();
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const stores = new Map();

export function forOrg(org) {
  const have = stores.get(org);
  if (have) return have;

  const FILE = join(stateDir(org), 'workspace.json');
  let saved = {};
  try { saved = JSON.parse(readFileSync(FILE, 'utf8')) ?? {}; } catch { /* never named */ }

  function persist() {
    try {
      mkdirSync(stateDir(org), { recursive: true });
      writeFileSync(FILE, `${JSON.stringify(saved, null, 2)}\n`);
    } catch { /* read-only checkout: the session still has it in memory */ }
  }

  const store = {
    org,

    /**
     * What the UI draws. `named` is the question the first-run flow asks —
     * "has anybody said what this is called yet" — and it is deliberately not
     * `Boolean(name)` at every call site, because two of them would eventually
     * disagree about whether a blank string counts.
     */
    describe() {
      const name = text(saved.name, NAME_MAX);
      return {
        name: name || null,
        owner: text(saved.owner, OWNER_MAX) || null,
        named: Boolean(name),
        createdAt: saved.createdAt ?? null,
        updatedAt: saved.updatedAt ?? null,
      };
    },

    /**
     * Name it, or rename it. Either field alone is allowed — renaming a
     * workspace should not make you re-type who you are.
     */
    set({ name, owner } = {}) {
      if (name !== undefined) {
        const n = text(name, NAME_MAX);
        if (!n) throw new Error('A workspace needs a name');
        saved.name = n;
      }
      if (owner !== undefined) saved.owner = text(owner, OWNER_MAX);
      saved.createdAt ??= now();
      saved.updatedAt = now();
      persist();
      return store.describe();
    },
  };
  stores.set(org, store);
  return store;
}
