<script setup>
/**
 * One icon, named rather than drawn.
 *
 * `<Icon name="console" class="size-4 shrink-0" />` draws whatever src/icons
 * holds for "console" — the designer's PNG if one has been dropped in, the
 * line-art glyph if it has not. Callers never learn which, which is what lets a
 * set arrive one file at a time without a single component changing.
 *
 * The size comes from the caller, always: the root is a plain span the class
 * lands on and everything inside is `size-full`, so the same name is 16px in
 * the sidebar and 48px on a card with nothing here to know about either.
 *
 * aria-hidden throughout, like SiteIcon: the label beside the icon is the
 * accessible name, and a second reading of it is noise. `alt` is still carried
 * on the image so a viewer with images off gets the word rather than a hashed
 * file name.
 */
import { computed } from 'vue';
import { GLYPHS, png } from '@/icons';

const props = defineProps({
  name: { type: String, required: true },
  alt: { type: String, default: '' },
});

const set = computed(() => png(props.name));
/**
 * A set drawn for the dark theme alone shows in both, rather than nothing in
 * the light one: half a set is a work in progress, not a reason for a gap.
 */
const light = computed(() => (set.value ? set.value.light ?? set.value.dark : null));
const dark = computed(() => set.value?.dark ?? null);
const glyph = computed(() => GLYPHS[props.name] ?? null);

/** Whichever density exists is the src; srcset names each one that does. */
const src = (v) => v['1x'] ?? v['2x'];
const srcset = (v) => [v['1x'] && `${v['1x']} 1x`, v['2x'] && `${v['2x']} 2x`].filter(Boolean).join(', ');
</script>

<template>
  <!-- One root element, so the caller's `class` merges onto it. -->
  <span aria-hidden="true" class="inline-block shrink-0">
    <!-- Two images swapped by the theme rather than one with a filter: the
         `dark:` variant follows the choice on <html> (app.css), so this works
         on a viewer who picked dark on a machine set to light. The light one
         is only hidden in the dark theme when there is something to replace
         it with. -->
    <template v-if="light">
      <img :src="src(light)" :srcset="srcset(light)" :alt="alt" draggable="false"
           class="size-full object-contain" :class="dark && 'dark:hidden'">
      <img v-if="dark" :src="src(dark)" :srcset="srcset(dark)" :alt="alt" draggable="false"
           class="hidden size-full object-contain dark:block">
    </template>
    <!-- No PNG yet: the glyph, which inherits the row's colour the way the
         inline icons always did. Neither one, and the span stays empty rather
         than drawing a placeholder nobody asked for. -->
    <svg v-else-if="glyph" viewBox="0 0 16 16" class="size-full" fill="none" stroke="currentColor"
         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path :d="glyph" />
    </svg>
  </span>
</template>
