<script setup>
/**
 * The stage: a video of another browser, and the one place you drive it.
 *
 * The canvas is a video of another browser. Clicking it does NOT move your
 * mouse — the coordinates go to the server, which dispatches them over CDP, and
 * the arrow you see is drawn on top by the same VirtualCursor the executor uses.
 * That shared cursor is the whole trick: a demonstration and a replay reach the
 * page through one code path, so the recorder cannot tell them apart and what
 * you taught is what runs.
 *
 * One component, two views. The console drives the page; the monitoring page
 * picks elements on it. Both need the same frames, the same cursor, the same
 * "what am I waiting for" overlay and the same forwarding of pointer, wheel and
 * keys — and a second copy of any of those is how two views end up disagreeing
 * about where a click landed.
 *
 * `mode`: 'drive' (the default) forwards everything. 'pick' shows a crosshair
 * instead of the drawn arrow — the highlight is painted inside the driven page
 * by the runner's picker, so it arrives in the video, and a lagging arrow next
 * to a crosshair would be two pointers — and handles only Escape, as a `cancel`
 * event. A keystroke into a page you are inspecting can navigate it away from
 * the element you are about to pick; picking is a pointer activity.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useLive } from '@/stores/live';

const props = defineProps({
  /** The URL the owner is opening right now, or null — the "Opening …" state. */
  opening: { type: String, default: null },
  /** 'drive' | 'pick' */
  mode: { type: String, default: 'drive' },
});
const emit = defineEmits(['cancel']);

const VIEW = { w: 1180, h: 760 };          // must match the server's viewport

const live = useLive();
const canvas = ref(null);
const picking = computed(() => props.mode === 'pick');

// ------------------------------------------------------------------ frames
let ctx;
function paint(blob) {
  if (!ctx) return;
  // One object URL at a time. Creating one per frame without revoking it leaks
  // a few hundred megabytes over a long session.
  const next = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, VIEW.w, VIEW.h);
    URL.revokeObjectURL(next);
    live.painted = true;          // the black rectangle is gone
  };
  img.onerror = () => URL.revokeObjectURL(next);
  img.src = next;
}

onMounted(() => {
  ctx = canvas.value.getContext('2d', { alpha: false });
  live.connect();
  live.attachCanvas(paint);       // replays the frame the store already holds
});
onBeforeUnmount(() => live.detachCanvas());

/**
 * What the canvas is waiting for, in the user's terms.
 *
 * A black rectangle is indistinguishable from a crash. These are the three
 * real states, and each one tells you whether to wait, reload, or check the
 * server.
 */
const waiting = computed(() => {
  if (!live.connected) return { title: 'Connecting to the runner', body: 'The server drives the browser you are about to see. Reconnecting…' };
  // Another organisation has the browser (docs/AUTH.md §10): the runner
  // sends this socket no frames of their page, so the honest picture is
  // none — and a sentence saying whose it is and when it will be free.
  if (live.busy) return { title: `${live.driving.org} is driving the runner`, body: 'One browser, one organisation at a time. Nothing of theirs reaches this screen. You can open a page once their run has finished and they have been quiet for a minute.' };
  if (props.opening) return { title: `Opening ${props.opening}`, body: 'Loading the page in the runner’s browser.' };
  /**
   * Nothing open is checked BEFORE `painted`, because `about:blank` paints — a
   * blank white frame is still a frame, so the runner reports itself painted
   * and this state would never be reached. A white rectangle with no
   * explanation is only marginally better than the black one it replaced.
   */
  if (!live.url || live.url === 'about:blank') {
    return { title: 'Nothing open yet', body: 'Paste a URL above and press Open, or run a suite — the runner shows whatever it is driving.' };
  }
  if (live.painted) return null;
  return { title: 'Waiting for the first frame', body: 'The runner streams a frame whenever the page changes. If it is sitting still this can take a moment.' };
});

// ------------------------------------------------------------- interaction
/** Canvas pixels, not CSS pixels — the element is scaled to fit. */
function at(e) {
  const r = canvas.value.getBoundingClientRect();
  return {
    x: Math.round((e.clientX - r.left) * (VIEW.w / r.width)),
    y: Math.round((e.clientY - r.top) * (VIEW.h / r.height)),
  };
}
const move = (e) => { const p = at(e); live.send({ t: 'human.move', ...p }); };

/**
 * The wheel, forwarded — one message per frame, not one per tick.
 *
 * preventDefault first, or the console page scrolls instead of the page you are
 * driving, which looks exactly like the feed being frozen.
 *
 * Then coalesce. A trackpad emits wheel events at well over 100/s, and the
 * first version sent two socket messages for each one — so a single flick put
 * several hundred messages on the wire, every one of them a separate CDP
 * dispatch and a separate repaint. It scrolled, but in lurches. Accumulating
 * into one message per animation frame is both smoother to watch and roughly
 * an order of magnitude less traffic, and it matches how the browser itself
 * batches scrolling.
 */
let pending = { x: 0, y: 0 };
let frame = null;

function flush() {
  frame = null;
  const { x, y } = pending;
  pending = { x: 0, y: 0 };
  if (!x && !y) return;
  live.send({ t: 'human.wheel', deltaY: y, deltaX: x });
}

function wheel(e) {
  e.preventDefault();
  // The pointer position matters — a wheel scrolls whatever is under it, which
  // is how an inner pane scrolls instead of the page.
  const p = at(e);
  if (p.x !== live.cursor.x || p.y !== live.cursor.y) live.send({ t: 'human.move', ...p });
  pending.y += e.deltaY;
  pending.x += e.deltaX;
  frame ??= requestAnimationFrame(flush);
}
onBeforeUnmount(() => { if (frame) cancelAnimationFrame(frame); });

const click = (e) => { const p = at(e); live.send({ t: 'human.move', ...p }); live.send({ t: 'human.click' }); };
function key(e) {
  if (picking.value) {
    // Escape is the owner's to act on (it tells the runner to stop picking);
    // stopped here so a page-level listener does not send the same stop
    // twice. Nothing else is forwarded while picking.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); emit('cancel'); }
    return;
  }
  if (e.key.length === 1) { e.preventDefault(); live.send({ t: 'human.key', text: e.key }); }
  else if (['Enter', 'Tab', 'Backspace', 'Escape'].includes(e.key)) {
    e.preventDefault(); live.send({ t: 'human.key', key: e.key });
  }
}

const cursorStyle = computed(() => ({
  transform: `translate(${live.cursor.x / VIEW.w * 100}cqw, ${live.cursor.y / VIEW.h * 100}cqh)`,
}));

/** So the owner can put the keyboard on the canvas — picking starts, Escape must reach it. */
defineExpose({ focus: () => canvas.value?.focus() });
</script>

<template>
  <div class="stage relative rounded-t-none" style="container-type: size; aspect-ratio: 1180 / 760">
    <canvas ref="canvas" :width="VIEW.w" :height="VIEW.h" tabindex="0"
            class="block h-full w-full" :class="picking ? 'cursor-crosshair' : 'cursor-none'"
            :aria-label="picking
              ? 'The page being watched — hover an element and click it to pick it'
              : 'The page being driven — click, type and scroll here to demonstrate'"
            @mousemove="move" @click="click" @keydown="key" @wheel.prevent="wheel" />
    <!-- The arrow is drawn here, not in the page. It is the same (x,y) the
         server dispatched, so what you see is where the click landed. Not while
         picking: the crosshair is the pointer then, and the picker's own
         highlight inside the video is the feedback. -->
    <svg v-show="!picking" class="pointer-events-none absolute left-0 top-0 size-6 drop-shadow" :style="cursorStyle" viewBox="0 0 24 24">
      <!-- Accent fill, white outline: the page underneath can be any colour,
           and an arrow that disappears over a dark hero is worse than none. -->
      <path d="M5 2l14 9-6 1.2L10.2 20z" fill="var(--color-brand)" stroke="#fff"
            stroke-width="1.6" stroke-linejoin="round" />
    </svg>

    <!-- Never a bare black rectangle: it is indistinguishable from a crash. -->
    <div v-if="waiting"
         class="absolute inset-0 grid place-content-center gap-3 justify-items-center bg-night px-8 text-center">
      <svg class="size-7 animate-spin text-white/70" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity=".22" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      </svg>
      <p class="text-[14px] font-medium text-white">{{ waiting.title }}</p>
      <p class="max-w-sm text-[12.5px] leading-relaxed text-white/55">{{ waiting.body }}</p>
      <button v-if="live.connected" class="mt-1 rounded-full border border-white/20 px-3.5 py-1.5 text-[12.5px] text-white/80 hover:bg-white/10"
              @click="live.send({ t: 'frame.request' })">
        Ask for a frame
      </button>
    </div>
  </div>
</template>
