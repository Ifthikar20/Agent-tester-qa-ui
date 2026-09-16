/**
 * The landing page — the painting behind its hero, and the two states it
 * has now that an account may look at it.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const ROUTER = read('../src/router.js');
const VIEW = read('../src/views/LandingView.vue');
const CANVAS = read('../src/components/landing/LandingCanvas.vue');

// ---- who may see it

test('the landing route is open, and no longer for strangers only', () => {
  const route = ROUTER.match(/\{ path: '\/', name: 'landing'[\s\S]*?\},\n/);
  assert.ok(route, 'router.js has no landing route');
  assert.match(route[0], /meta: \{ open: true \}/);
  assert.doesNotMatch(route[0], /anonymousOnly/);
  // With no control plane there is nobody to sign in or out, so the guard
  // still sends every open page to the suites and the landing never mounts.
  assert.match(ROUTER, /if \(!session\.required\) return to\.meta\.open \? '\/suites' : true;/);
});

test('signed in means a real account, not the open runner', () => {
  assert.match(VIEW, /const signedIn = computed\(\(\) => session\.required && session\.user !== null\);/);
});

// ---- the two states

test('every sign-in becomes the app for an account, and there is a way out', () => {
  // No button or link is still hard-wired to the sign-in page except the
  // stranger's branch of a pair: each `:to="signIn"` is on an element with a
  // v-else, whose v-if sibling is the account's.
  const template = VIEW.slice(VIEW.indexOf('<template>'), VIEW.indexOf('</template>'));
  for (const line of template.split('\n').filter((l) => l.includes(':to="signIn"'))) {
    assert.match(line, /v-else/, `a sign-in with no account branch: ${line.trim()}`);
  }
  const logOuts = template.match(/@click="logOut"/g) ?? [];
  assert.ok(logOuts.length >= 3, `Log out is in the nav, the sheet and the footer; found ${logOuts.length}`);
  for (const line of template.split('\n').filter((l) => l.includes('@click="logOut"'))) {
    assert.match(line, /<button/, 'an action is a button, not a link');
    assert.match(line, /:disabled="loggingOut"/, 'a second press while the first is in flight would be a second request');
  }
  // Logging out stays on this page: nothing routes away afterwards.
  const fn = VIEW.match(/async function logOut\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /await session\.logout\(\)/);
  assert.doesNotMatch(fn, /router|push|replace/);
});

// ---- the painting

test('the picture is bundled, so the CSP (img-src self) can serve it, and both pages show the same one', () => {
  const file = read('../src/assets/landing/painting.js').match(/export \{ default as painting \} from '\.\/([^']+)'/)?.[1];
  assert.ok(file, 'painting.js re-exports one picture');
  const path = new URL(`../src/assets/landing/${file}`, import.meta.url);
  assert.ok(existsSync(path), `${file} is missing`);
  // A stand-in that fetched anything would fail the same CSP.
  assert.doesNotMatch(readFileSync(path, 'utf8'), /https?:\/\/(?!www\.w3\.org)/);
  for (const [name, src] of [['LandingCanvas.vue', CANVAS], ['AuthShell.vue', read('../src/components/AuthShell.vue')]]) {
    assert.match(src, /import \{ painting \} from '@\/assets\/landing\/painting'/, `${name} shows the shared picture`);
  }
});

test('the scroll-driven motion only moves, so it stays on the compositor', () => {
  const frames = [...CANVAS.matchAll(/@keyframes\s+\S+\s*\{([\s\S]*?)\n\}/g)];
  assert.ok(frames.length >= 1, 'no keyframes');
  for (const [, body] of frames) {
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    assert.ok(props.length > 0);
    assert.deepEqual(props.filter((p) => !['transform', 'opacity'].includes(p)), [], `animates layout: ${props}`);
  }
  assert.match(CANVAS, /@supports \(animation-timeline: scroll\(\)\)/, 'the animation is gated on scroll timelines');
  const reduced = CANVAS.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(reduced, /animation: none/, 'reduced motion switches the climb off');
});

test('the wash is nearly cream at the top and nothing at the bottom', () => {
  const wash = CANVAS.match(/\.wash \{[\s\S]*?\n\}/)[0];
  const stops = [...wash.matchAll(/rgba\(255, 249, 240, (\.\d+|0|1)\)\s+(\d+)%/g)].map(([, a, at]) => [Number(a), Number(at)]);
  assert.ok(stops.length >= 3, 'a gradient of at least three stops');
  assert.ok(stops[0][1] === 0 && stops[0][0] >= .9, 'top: at least 90% cream');
  assert.equal(stops.at(-1)[0], 0, 'bottom: bare paint');
  for (let i = 1; i < stops.length; i++) assert.ok(stops[i][0] <= stops[i - 1][0] && stops[i][1] > stops[i - 1][1], 'thins monotonically');
});
