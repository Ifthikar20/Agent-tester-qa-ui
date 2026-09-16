<script setup>
/**
 * The one page a stranger can reach.
 *
 * Everything else in this application needs the runner, and the runner needs a
 * token — so before today the front door was a sign-in form with no answer to
 * "sign in to what". A person who has been sent a link, or who is deciding
 * whether to ask for an account, had nowhere to land.
 *
 * It is deliberately not a brochure. The claims below are the three the product
 * can actually make, each one a thing you can check on the next screen rather
 * than a promise: you watch the run happen, you can record one instead of
 * writing it, and the diagram is generated from the same structure that
 * executes. A landing page that oversells a tool is one the first real run
 * contradicts.
 *
 * Signed in, the router never sends anyone here (meta.anonymousOnly), and with
 * no control plane at all there is no sign-in to advertise, so the guard sends
 * you straight to the suites. This page exists for exactly one state.
 */
import Btn from '@/components/Btn.vue';

/**
 * The canvas behind the opening: a painting, photographed. The page colour
 * covers it at the top so the words sit on something calm, the texture comes
 * through toward the foot of the hero, and it fades back to the page colour
 * under the section after, so scrolling on never crosses an edge. The file
 * lives in web/public; the SVG there is a stand-in with the same weight of
 * colour — drop the photograph beside it and point this at it.
 */
const CANVAS = `${import.meta.env.BASE_URL}landing-canvas.svg`;

/** What a case actually looks like, taken from the language the parser accepts. */
const SCRIPT = `goto https://staging.acme.com/
fill 'Email' : textbox = $QA_USER
fill 'Password' : textbox = $QA_PASS
click 'Sign in' : button
assert text 'Welcome back'`;

const CLAIMS = [
  {
    title: 'You watch it happen',
    body: 'A real Chromium opens your page and a cursor glides across it, clicking and typing. The feed is streamed to the console at about ten frames a second, so a failing step is something you saw, not something you reconstruct from a log.',
  },
  {
    title: 'Record it instead of writing it',
    body: 'The browser extension holds your next click, asks what you meant by it, and writes the step. Sign in as part of the flow; the password is dropped on the way through and becomes a vault key you point at.',
  },
  {
    title: 'The diagram cannot drift',
    body: 'The picture below a run is drawn from the same structure the executor walks — once as a plan, once with the outcomes folded in. It is not a second description of the test that someone has to remember to update.',
  },
];
</script>

<template>
  <!-- `isolate`: the canvas below is z-indexed under everything in here, the
       bar included, and this is the stacking context that makes that true. -->
  <div class="relative isolate min-h-dvh">
    <!-- The bar is links, not navigation: there are two places to go. -->
    <header class="border-b border-hairline/60">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <span class="text-[15px] font-semibold tracking-tight">
          ghost<span class="text-brand">click</span>
        </span>
        <nav class="flex items-center gap-2">
          <RouterLink :to="{ name: 'login' }"
                      class="rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-ink/[0.04] hover:text-ink">
            Sign in
          </RouterLink>
          <RouterLink :to="{ name: 'signup' }">
            <Btn size="sm">Create an account</Btn>
          </RouterLink>
        </nav>
      </div>
    </header>

    <main>
      <!-- The opening — the hero and the case — sits on the canvas, and the
           canvas ends with it: sized by the content, not the viewport, so the
           page colour has fully risen back over the picture exactly where the
           next section begins, whatever the screen. It reaches up behind the
           bar too. Three layers: the picture, the page colour laid over its
           top and thinning down the hero, and the page colour rising over its
           foot. Where the browser can drive an animation from the scroll
           position the picture also drifts up a little slower than the page
           (app.css canvas-drift); elsewhere it simply sits. -->
      <div class="relative">
        <div class="pointer-events-none absolute inset-x-0 -top-16 bottom-0 -z-10 overflow-hidden" aria-hidden="true">
          <div class="canvas-drift absolute inset-x-0 top-0 -bottom-[24vh] bg-cover bg-center"
               :style="{ backgroundImage: `url(${CANVAS})` }" />
          <div class="absolute inset-0 bg-gradient-to-b from-ground via-ground/70 via-35% to-transparent" />
          <div class="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-ground via-ground/75 via-30% to-transparent" />
        </div>

      <!-- Hero. Sized to what it holds; a viewport-tall opener would push the
           rest of the page out of the first frame. -->
      <!-- No wash of its own: the canvas behind the page is the colour here. -->
      <section>
        <div class="mx-auto max-w-5xl px-6 pb-24 pt-14 sm:pb-32 sm:pt-20">
          <p class="eyebrow">Browser testing you can watch</p>
          <!-- No hard break: at a phone's width it strands a word on its own
               line. `text-balance` lets the browser choose, which is the only
               thing that knows how wide the column ended up. -->
          <h1 class="display mt-3 max-w-2xl text-balance text-4xl sm:text-5xl">
            Drive your app the way a person would.
          </h1>
          <p class="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-2">
            ghostclick opens a real browser, points it at an application you have allowed,
            and works through your test case one step at a time — with a cursor you can
            see. When something breaks you watch it break.
          </p>
          <div class="mt-8 flex flex-wrap items-center gap-3">
            <RouterLink :to="{ name: 'signup' }"><Btn>Create an account</Btn></RouterLink>
            <RouterLink :to="{ name: 'login' }"><Btn variant="ghost">Sign in</Btn></RouterLink>
          </div>
          <p class="mt-4 text-[12.5px] text-ink-3">
            Accounts are by invitation while this is in preview.
          </p>
        </div>
      </section>

      <!-- What a case is. The language is the product's surface, so it belongs
           above the feature list rather than in a footnote. -->
      <section class="mx-auto max-w-5xl px-6 py-16">
        <div class="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center">
          <div>
            <p class="eyebrow">A test case</p>
            <h2 class="display mt-2 text-2xl">Five lines, and no selectors.</h2>
            <p class="mt-4 text-[14px] leading-relaxed text-ink-2">
              Steps name what is on the screen and the role it plays — the button called
              Sign in, the textbox called Password — which is how the browser itself
              describes the page. A rewritten class name does not break your suite.
            </p>
            <p class="mt-3 text-[14px] leading-relaxed text-ink-2">
              A value starting with <code class="rounded bg-ink/[0.05] px-1 py-0.5 font-mono text-[12.5px]">$</code>
              is read from the vault on the server at the moment the field is filled. It
              never reaches this page, a log, or the diagram.
            </p>
          </div>
          <div class="stage overflow-x-auto rounded-xl p-5">
            <pre class="font-mono text-[12.5px] leading-relaxed"><code>{{ SCRIPT }}</code></pre>
          </div>
        </div>
      </section>
      </div>

      <!-- Three claims, each checkable on the next screen. -->
      <section class="border-t border-hairline bg-panel">
        <div class="mx-auto max-w-5xl px-6 py-16">
          <h2 class="display text-2xl">What makes it different</h2>
          <div class="mt-8 grid gap-5 md:grid-cols-3">
            <article v-for="c in CLAIMS" :key="c.title" class="card p-5">
              <h3 class="text-[15px] font-semibold">{{ c.title }}</h3>
              <p class="mt-2 text-[13.5px] leading-relaxed text-ink-2">{{ c.body }}</p>
            </article>
          </div>
        </div>
      </section>

      <!-- The gate. Worth saying on the way in rather than discovering later,
           because it is the thing that will stop someone's first run. -->
      <section class="mx-auto max-w-5xl px-6 py-16">
        <div class="card p-6 sm:p-8">
          <p class="eyebrow">Before you point it anywhere</p>
          <h2 class="display mt-2 text-2xl">It will only drive what you allow.</h2>
          <p class="mt-4 max-w-2xl text-[14px] leading-relaxed text-ink-2">
            This is a browser that goes where it is told, so the list of origins it may
            open is a decision a person makes, once, per origin — never a script, never a
            generated plan. The private network is refused by name even when the list says
            everything, which is what stops a wandering test from reaching a metadata
            endpoint inside your own infrastructure.
          </p>
          <p class="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-2">
            Credentials live in a vault beside the runner. Your suite refers to them by
            name; the values stay on the server.
          </p>
        </div>
      </section>
    </main>

    <footer class="border-t border-hairline">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-[12.5px] text-ink-3">
        <span>ghostclick — browser automation you can watch</span>
        <span class="flex gap-4">
          <RouterLink :to="{ name: 'login' }" class="underline hover:text-ink">Sign in</RouterLink>
          <RouterLink :to="{ name: 'signup' }" class="underline hover:text-ink">Create an account</RouterLink>
        </span>
      </div>
    </footer>
  </div>
</template>
