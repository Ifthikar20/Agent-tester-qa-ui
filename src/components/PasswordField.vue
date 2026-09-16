<script setup>
/**
 * One password field with a reveal toggle.
 *
 * One, not two: "type it again" catches a typo you can no longer see, and
 * the reveal lets you see it. Paste is allowed — a password manager is the
 * best thing that can happen to this field, and blocking paste only stops
 * the people who use one. No strength meter: the control plane's validators
 * decide (fifteen characters, not in a breach, not your own name), and a
 * meter that disagrees with them is theatre.
 */
import { ref } from 'vue';
import Field from '@/components/Field.vue';

defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: 'Password' },
  autocomplete: { type: String, default: 'current-password' },
  hint: { type: String, default: '' },
});
defineEmits(['update:modelValue']);
const shown = ref(false);
</script>

<template>
  <Field :label="label" :hint="hint">
    <div class="relative">
      <input :value="modelValue" :type="shown ? 'text' : 'password'" :autocomplete="autocomplete" required
             spellcheck="false" class="pr-11"
             @input="$emit('update:modelValue', $event.target.value)">
      <!-- An eye, the way every other sign-in draws the reveal; the words are for assistive tech. -->
      <button type="button" class="absolute inset-y-0 right-1.5 my-auto grid size-8 place-items-center rounded-md text-ink-3 hover:text-ink"
              :aria-pressed="shown" :aria-label="shown ? 'Hide password' : 'Show password'"
              :title="shown ? 'Hide password' : 'Show password'" @click="shown = !shown">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
          <path v-if="shown" d="M4 4l16 16" />
        </svg>
      </button>
    </div>
  </Field>
</template>
