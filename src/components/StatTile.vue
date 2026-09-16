<script setup>
// `dot` keys the tile to a colour drawn elsewhere on the page, beside the label.
defineProps({ label: String, value: [String, Number], note: String, dot: String });
</script>

<template>
  <div class="card px-5 py-4">
    <p class="eyebrow flex items-center gap-1.5"><span v-if="dot" class="size-2 rounded-full" :class="dot" aria-hidden="true" />{{ label }}</p>
    <p class="mt-1.5 display text-3xl tabular-nums">{{ value }}</p>
    <p v-if="note" class="mt-1 text-[13px] text-ink-3">{{ note }}</p>
  </div>
</template>
