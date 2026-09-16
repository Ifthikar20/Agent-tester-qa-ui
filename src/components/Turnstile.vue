<script setup>
/**
 * Cloudflare Turnstile, rendered only when the control plane asks for it.
 *
 * The site key comes from GET /auth/config; unset, this component is never
 * mounted and Cloudflare's script is never loaded. The runner's CSP admits
 * challenges.cloudflare.com only when the same key is in its environment,
 * so a widget that renders is one the policy expected.
 *
 * The token it produces is one-use: after a refused submit the widget is
 * reset so the next attempt carries a fresh one.
 *
 * Drawn in the page's theme. Cloudflare's own default is `auto`, which follows
 * the device rather than this page, so a dark device used to get a dark widget
 * on a light form. The theme is fixed when the widget is drawn — there is no
 * changing it afterwards — so a change of theme redraws it, but only while it
 * is unsolved: a solved challenge is not thrown away over a colour. The next
 * reset() redraws it instead.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useUi } from '@/stores/ui';

const props = defineProps({ siteKey: { type: String, required: true } });
const emit = defineEmits(['token']);

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const host = ref(null);
const ui = useUi();
let widgetId = null;
let solved = false;
let drawnDark = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT}"]`);
    if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return; }
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function draw() {
  drawnDark = ui.dark;
  solved = false;
  widgetId = window.turnstile.render(host.value, {
    sitekey: props.siteKey,
    theme: ui.dark ? 'dark' : 'light',
    callback: (token) => { solved = true; emit('token', token); },
    'expired-callback': () => { solved = false; emit('token', ''); },
    'error-callback': () => { solved = false; emit('token', ''); },
  });
}

function remove() {
  try { if (widgetId !== null) window.turnstile?.remove(widgetId); } catch { /* already gone */ }
  widgetId = null;
}

/** remove() calls none of the widget's callbacks, so the token is cleared here. */
function redraw() {
  remove();
  emit('token', '');
  try { draw(); } catch { /* the next reset() tries again */ }
}

onMounted(async () => {
  try {
    await loadScript();
    draw();
  } catch { emit('token', ''); }
});

watch(() => ui.dark, () => { if (widgetId !== null && !solved) redraw(); });

onBeforeUnmount(remove);

defineExpose({
  reset() {
    emit('token', '');
    solved = false;
    if (widgetId !== null && drawnDark !== ui.dark) return void redraw();
    try { if (widgetId !== null) window.turnstile?.reset(widgetId); } catch { /* not rendered */ }
  },
});
</script>

<template>
  <div ref="host" class="min-h-[65px]" />
</template>
