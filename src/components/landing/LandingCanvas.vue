<script setup>
/**
 * The painting behind the top of the landing page.
 *
 * A photograph of a painted canvas sits under the hero. At the top it is all
 * but covered by a wash of the page's cream — a hue, enough to say something
 * is there, and the headline and the nav read against it as they always did.
 * The wash thins on the way down, and by the foot of the hero the paint and
 * the weave of the cloth are bare. Below that the whole picture dissolves into
 * the page's own cream before the first section of copy, so nothing further
 * down is ever read across a painting.
 *
 * It scrolls with the page rather than pinning itself to the viewport, which
 * is what lets the wash be a plain gradient: scrolling carries the covered
 * top away and brings the bare bottom up, and the dissolve is the page's
 * ground arriving. The one moving part is the picture itself, which climbs a
 * little slower than the page — a scroll-driven animation of `transform`
 * alone, so it runs on the compositor and costs no script. A browser with no
 * scroll timelines, and a person who asked for less motion, get the same
 * picture standing still.
 *
 * The parent decides the height: this fills its nearest positioned ancestor
 * and hangs `--overhang` below it, which is where the dissolve happens. The
 * page keeps the layer at z-index -1 of the landing's own stacking context,
 * so it paints over the cream and under every word.
 *
 * The image comes from src/assets/landing/painting.js, which every page that
 * shows the painting imports, so they agree. It is bundled — the runner
 * serves this app under `img-src 'self' data: blob:` and would refuse a
 * picture fetched from anywhere else — and it is a drawn stand-in until the
 * photograph of the real canvas lands beside it.
 */
import { ref } from 'vue';
import { painting } from '@/assets/landing/painting';

defineProps({
  /** The picture. Bundled, for the CSP's sake — see above. */
  src: { type: String, default: painting },
});

// The picture fades in once it has arrived rather than popping over the
// cream; until then the wash alone is on the page, which is close to what the
// top of the picture looks like anyway.
const loaded = ref(false);
</script>

<template>
  <div class="canvas" :class="{ loaded }" aria-hidden="true">
    <img class="picture" :src="src" alt="" decoding="async" fetchpriority="high" @load="loaded = true" />
    <i class="wash" />
  </div>
</template>

<style scoped>
.canvas {
  --cream: #fff9f0;
  --overhang: 200px;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: calc(-1 * var(--overhang));
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  /* The dissolve: the last stretch, the overhang, fades to nothing. */
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - var(--overhang)), transparent 100%);
  mask-image: linear-gradient(to bottom, #000 calc(100% - var(--overhang)), transparent 100%);
}

/* Taller than its frame and starting above it, so it can climb without its
   top edge ever coming into view. */
.picture {
  position: absolute;
  left: 0;
  top: -12%;
  width: 100%;
  height: 124%;
  object-fit: cover;
  opacity: 0;
  transition: opacity .8s ease;
  will-change: transform;
}
.loaded .picture { opacity: 1; }

/* Cream over the picture: nearly all of it at the top, none by the bottom.
   Stops are percentages of the layer, so a taller hero — a phone, where it
   stacks — keeps the same proportions rather than the same pixels. */
.wash {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(255, 249, 240, .94) 0%,
    rgba(255, 249, 240, .88) 26%,
    rgba(255, 249, 240, .6) 48%,
    rgba(255, 249, 240, .24) 64%,
    rgba(255, 249, 240, 0) 74%
  );
}

/* The climb. The page scrolls at 1; the picture, translated down as the page
   goes up, appears to move at a little under that. 9% of its own height over
   the first 120vh of scrolling, which is about as long as it is on screen. */
@supports (animation-timeline: scroll()) {
  .picture {
    animation: climb linear both;
    animation-timeline: scroll(root);
    animation-range: 0 120vh;
  }
}
@keyframes climb {
  from { transform: translate3d(0, 0, 0); }
  to   { transform: translate3d(0, 9%, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .picture { animation: none; transition: none; }
}
</style>
