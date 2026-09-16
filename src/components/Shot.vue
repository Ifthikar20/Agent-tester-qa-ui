<script setup>
/**
 * A monitoring screenshot clip, fetched behind the gate.
 *
 * An `<img src>` cannot carry the Bearer header, so the bytes are fetched with
 * the same token the JSON calls use and shown through a blob URL — the reason
 * SiteIcon does the same. Unlike the icons, which are few and kept for the
 * page's life, incident clips are many and large, and the after-shot is
 * renamed when an incident is updated: so the URL is revoked on every change
 * and on unmount, and a slow answer for a previous name cannot land on top of
 * a newer one.
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import { api } from '@/api';

const props = defineProps({
  /** The shot's file name, as the runner names it; null for none. */
  name: { type: String, default: null },
  alt: { type: String, default: '' },
  caption: { type: String, default: '' },
});

const src = ref(null);
let seq = 0;
const revoke = () => { if (src.value) URL.revokeObjectURL(src.value); src.value = null; };

async function load() {
  const mine = ++seq;
  revoke();
  if (!props.name) return;
  const blob = await api.monitorShot(props.name);
  if (mine !== seq) return;         // a newer name has been asked for since
  src.value = blob ? URL.createObjectURL(blob) : null;
}
watch(() => props.name, load, { immediate: true });
onBeforeUnmount(revoke);
</script>

<template>
  <figure class="m-0 rounded-lg border border-hairline bg-ground p-2">
    <figcaption v-if="caption" class="eyebrow mb-1.5">{{ caption }}</figcaption>
    <img v-if="src" :src="src" :alt="alt" class="block w-full rounded bg-white">
    <div v-else class="grid h-20 place-items-center text-[12px] text-ink-3">no screenshot</div>
  </figure>
</template>
