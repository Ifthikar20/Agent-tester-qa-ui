<script setup>
/**
 * The drafted checks a reply proposed (chat-plan.js), as the thing a person
 * ticks. Each row is a candidate: its name, its size, why it was drafted, and
 * its script on request — the exact text the runner will run, in FlowBox
 * like any saved case. The list IS the confirm: Run sends the ticked ids on
 * the yes (stores/chat.js send), and the runner runs those and no others.
 *
 * Nothing here runs or saves anything by itself; that is the runner's rule
 * (chat.js), and this component only draws the choice.
 */
import { computed, ref } from 'vue';
import Btn from '@/components/Btn.vue';
import FlowBox from '@/components/FlowBox.vue';

const props = defineProps({
  /** [{ id, name, steps, flow, why? }] — the proposal's items */
  items: { type: Array, default: () => [] },
  disabled: Boolean,
  /** The sentence above the list; the drafted checks' own unless the caller has another (translated checks). */
  intro: { type: String, default: null },
});
const emit = defineEmits(['run', 'drop']);

/** Ticked by default: the person asked for them; untick what is not wanted. */
const ticked = ref(new Set(props.items.map((i) => i.id)));
const shown = ref(new Set());
const flip = (set, id) => { const next = new Set(set.value); if (next.has(id)) next.delete(id); else next.add(id); set.value = next; };
const tick = (id) => flip(ticked, id);
const show = (id) => flip(shown, id);
const chosen = computed(() => props.items.filter((i) => ticked.value.has(i.id)).map((i) => i.id));
const rowsOf = (flow) => Math.min(12, Math.max(3, String(flow ?? '').split('\n').length));
</script>

<template>
  <div>
    <p class="text-ink">{{ intro ?? 'Drafted checks — tick the ones to run. Each runs once and, when the check rather than the page was wrong, is fixed and run once more.' }}</p>
    <ul class="mt-2 space-y-1.5">
      <li v-for="i in items" :key="i.id" class="rounded-lg border border-hairline bg-panel px-3 py-2">
        <div class="flex items-start gap-2">
          <input :id="`draft-${i.id}`" type="checkbox" class="mt-0.5 shrink-0" :checked="ticked.has(i.id)" :disabled="disabled" @change="tick(i.id)">
          <label :for="`draft-${i.id}`" class="min-w-0 flex-1 cursor-pointer">
            <span class="font-medium text-ink">{{ i.name }}</span>
            <span class="text-ink-3"> · {{ i.steps }} step{{ i.steps === 1 ? '' : 's' }}</span>
            <span v-if="i.why" class="block text-[12px] text-ink-2">{{ i.why }}</span>
          </label>
          <button type="button" class="shrink-0 text-[12px] text-brand-2 underline underline-offset-2" @click="show(i.id)">
            {{ shown.has(i.id) ? 'hide steps' : 'show steps' }}
          </button>
        </div>
        <FlowBox v-if="shown.has(i.id)" :model-value="i.flow" :rows="rowsOf(i.flow)" readonly class="mt-2" />
      </li>
    </ul>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <Btn size="sm" :disabled="disabled || !chosen.length" @click="emit('run', chosen)">
        Run {{ chosen.length === items.length ? 'all' : chosen.length }}
      </Btn>
      <Btn size="sm" variant="ghost" :disabled="disabled" @click="emit('drop')">No</Btn>
      <span class="text-[11.5px] text-ink-3">Nothing is saved until you keep one afterwards.</span>
    </div>
  </div>
</template>
