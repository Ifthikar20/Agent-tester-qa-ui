<script setup>
/**
 * A reply being made, as the agents at work on it.
 *
 * One row per step, top to bottom: the mind understanding the question, each
 * agent it asked (the defects agent reading the registry, the runner driving
 * a case, the docs agent looking a section up — agents.js names them), and
 * the answer being written. A row is waiting, working (a pulse and elapsed
 * time), done (a tick) or failed (a cross), driven by the turn the store keeps
 * from the socket's chat.turn, chat.tool and chat.delta events — so this
 * draws what is actually happening, never a script of what should.
 *
 * Before any agent has been asked the one working row cycles loading text
 * (agents.js THINKING), because a still spinner for four seconds reads as a
 * hang and a line that moves reads as thought.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { agentOf, THINKING } from '@/agents';
import Icon from '@/components/Icon.vue';

const props = defineProps({
  /** stores/chat.js turn: { text, tools: [{ id, name, label, state, summary, at?, doneAt? }], running, startedAt? } */
  turn: { type: Object, required: true },
});

const now = ref(Date.now());
let tick = null;
const phrase = ref(0);
onMounted(() => { tick = setInterval(() => { now.value = Date.now(); phrase.value = (phrase.value + 1) % THINKING.length; }, 1400); });
onBeforeUnmount(() => clearInterval(tick));

const elapsed = (from, to) => {
  if (!from) return '';
  const ms = (to ?? now.value) - from;
  return ms < 1000 ? `${Math.max(0, Math.round(ms / 100) / 10).toFixed(1)} s` : `${(ms / 1000).toFixed(1)} s`;
};

const writing = computed(() => !!props.turn.text);
const asked = computed(() => props.turn.tools?.length > 0);

/** The rows, in the order things happened. */
const rows = computed(() => {
  const t = props.turn;
  const out = [{
    key: 'think', agent: { name: 'Mind', icon: 'chat' },
    label: asked.value || writing.value ? 'Understood the question' : THINKING[phrase.value],
    state: asked.value || writing.value ? 'done' : 'working',
    time: asked.value || writing.value ? '' : elapsed(t.startedAt),
  }];
  for (const c of t.tools ?? []) {
    out.push({
      key: c.id, agent: agentOf(c.name), label: c.label, summary: c.summary,
      state: c.state === 'start' ? 'working' : c.state === 'error' ? 'failed' : 'done',
      time: c.state === 'start' ? elapsed(c.at) : elapsed(c.at, c.doneAt),
    });
  }
  out.push({
    key: 'write', agent: { name: 'Mind', icon: 'chat' },
    label: writing.value ? 'Writing the answer' : 'Then the answer',
    state: writing.value ? 'working' : 'waiting',
    time: '',
  });
  return out;
});
</script>

<template>
  <div class="rounded-xl border border-hairline bg-panel px-4 py-3" data-activity>
    <p class="flex items-center gap-2 text-[12px] font-medium text-ink">
      <span class="size-1.5 animate-pulse rounded-full bg-brand" aria-hidden="true" />
      Working on it
      <span class="font-normal text-ink-3">{{ turn.tools?.length ?? 0 }} agent call{{ (turn.tools?.length ?? 0) === 1 ? '' : 's' }} so far</span>
    </p>
    <ol class="mt-2.5 space-y-1.5">
      <li v-for="r in rows" :key="r.key" class="flex items-start gap-2.5 text-[12.5px]" :data-state="r.state">
        <!-- the agent's mark, ringed while it works -->
        <span class="relative mt-px grid size-6 shrink-0 place-items-center rounded-full border"
              :class="r.state === 'working' ? 'border-brand/40 bg-brand-50 text-brand-2'
                    : r.state === 'done' ? 'border-hairline bg-ground text-ink-2'
                    : r.state === 'failed' ? 'border-critical/40 bg-critical/5 text-critical'
                    : 'border-dashed border-hairline text-ink-3/70'">
          <Icon :name="r.agent.icon" class="size-3.5" />
          <span v-if="r.state === 'working'" class="absolute -right-0.5 -top-0.5 size-2 animate-ping rounded-full bg-brand/60" aria-hidden="true" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-baseline gap-2">
            <span class="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em]"
                  :class="r.state === 'waiting' ? 'text-ink-3/70' : 'text-ink-3'">{{ r.agent.name }}</span>
            <span class="min-w-0 truncate" :class="r.state === 'working' ? 'text-ink' : r.state === 'waiting' ? 'text-ink-3' : 'text-ink-2'">{{ r.label }}</span>
            <span v-if="r.time" class="ml-auto shrink-0 tabular-nums text-[11px] text-ink-3">{{ r.time }}</span>
            <svg v-if="r.state === 'done'" viewBox="0 0 16 16" class="size-3.5 shrink-0 text-good" :class="!r.time && 'ml-auto'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 5" /></svg>
            <svg v-else-if="r.state === 'failed'" viewBox="0 0 16 16" class="ml-auto size-3.5 shrink-0 text-critical" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
          </span>
          <span v-if="r.summary && r.state !== 'working'" class="block truncate text-[11.5px] text-ink-3">{{ r.summary }}</span>
        </span>
      </li>
    </ol>
  </div>
</template>
