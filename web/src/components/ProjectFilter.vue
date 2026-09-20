<script setup>
/**
 * Which project you are looking at, on the pages that span all of them.
 *
 * Run history and Defects are deliberately workspace-wide — "what is broken"
 * is a question about everything you own, and answering it per project would
 * mean visiting six pages to find out. But the moment there is more than one
 * project, the list is mostly other people's problems, and the only way to
 * narrow it was a text box you had to know the name to type into.
 *
 * So: the projects themselves, as a row you press. By their own marks rather
 * than by name alone, because after a week you know your projects by their
 * favicons long before you read the word next to them — the same reason the
 * sidebar has always drawn them that way (SiteIcon).
 *
 * `null` is All and is the default. Both pages keep the choice in their own
 * state rather than here: one of them re-asks the runner when it changes
 * (run history filters server-side, which is cheaper than shipping every run)
 * and the other filters what it already holds, and a component that guessed
 * which would be wrong on one of them.
 */
import SiteIcon from '@/components/SiteIcon.vue';

defineProps({
  /** The projects to offer, as the suites store lists them: { id, name, origin }. */
  projects: { type: Array, default: () => [] },
  /** The chosen project's id, or null for all of them. */
  modelValue: { type: String, default: null },
  /** How many rows each project has, by id — drawn beside it when given. */
  counts: { type: Object, default: null },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <!-- Hidden entirely with one project: a filter offering "All" and the only
       thing there is is a control that cannot change anything. -->
  <div v-if="projects.length > 1" class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by project">
    <button type="button"
            class="rounded-full border px-3 py-1.5 text-[12.5px] transition"
            :class="modelValue === null ? 'border-brand/40 bg-brand-50 font-medium text-brand-2' : 'border-hairline text-ink-2 hover:border-ink/25 hover:text-ink'"
            :aria-pressed="modelValue === null"
            @click="$emit('update:modelValue', null)">
      All projects
    </button>
    <button v-for="p in projects" :key="p.id" type="button"
            class="flex items-center gap-2 rounded-full border py-1.5 pl-2 pr-3 text-[12.5px] transition"
            :class="modelValue === p.id ? 'border-brand/40 bg-brand-50 font-medium text-brand-2' : 'border-hairline text-ink-2 hover:border-ink/25 hover:text-ink'"
            :aria-pressed="modelValue === p.id" :title="p.name"
            @click="$emit('update:modelValue', modelValue === p.id ? null : p.id)">
      <SiteIcon :origin="p.origin" :name="p.name" size="size-4" />
      <span class="max-w-[10rem] truncate">{{ p.name }}</span>
      <!-- The count is the reason to press it, or the reason not to: a project
           with nothing in this list is worth knowing about before you click. -->
      <span v-if="counts" class="tabular-nums" :class="modelValue === p.id ? 'text-brand-2/70' : 'text-ink-3'">{{ counts[p.id] ?? 0 }}</span>
    </button>
  </div>
</template>
