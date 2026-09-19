<script setup>
/**
 * The schedules of one kind — a suite's runs, or the sweeps of the monitored
 * pages — as a card: each with its cadence in words, its next time, what its
 * last fire came to, a switch, Run now and a way out; and a row to add one
 * from a preset or a cron line. The runner keeps them (schedules.js) and
 * says on the socket when one fires, which is when this reloads.
 */
import { computed, ref, watch } from 'vue';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { PRESETS, describe, outcomeOf, until } from '@/schedules';
import { when } from '@/time';
import Btn from '@/components/Btn.vue';
import StatusPill from '@/components/StatusPill.vue';

const props = defineProps({
  kind: { type: String, required: true },       // 'suite' | 'sweep'
  suiteId: { type: String, default: null },
  title: { type: String, default: '' },
});
const live = useLive();
const list = ref(null);
const error = ref(null);
const busy = ref(new Set());
const preset = ref(props.kind === 'suite' ? 'daily' : 'hourly');
const time = ref('09:00');
const custom = ref('0 9 * * 1-5');
const name = ref('');
const adding = ref(false);
const addError = ref(null);

const chosen = computed(() => PRESETS.find((p) => p.id === preset.value) ?? PRESETS[0]);
const cron = computed(() => (chosen.value.custom ? custom.value.trim() : chosen.value.cron(time.value)));
const heading = computed(() => props.title || (props.kind === 'suite' ? 'Schedule' : 'Sweeps'));

async function load() {
  try {
    const r = await api.schedules(props.kind === 'suite' ? props.suiteId : null);
    list.value = (r.schedules ?? []).filter((s) => s.kind === props.kind && (props.kind !== 'suite' || s.suiteId === props.suiteId));
    error.value = null;
  } catch (e) { error.value = e.message; }
}
watch(() => [props.kind, props.suiteId, live.schedulesVersion], load, { immediate: true });

async function add() {
  adding.value = true;
  addError.value = null;
  try {
    await api.createSchedule({ kind: props.kind, suiteId: props.suiteId, cron: cron.value, name: name.value });
    name.value = '';
    await load();
  } catch (e) { addError.value = e.body?.message ?? e.message; }
  finally { adding.value = false; }
}
async function toggle(s) {
  try { await api.updateSchedule(s.id, { enabled: !s.enabled }); await load(); } catch (e) { error.value = e.message; }
}
async function runNow(s) {
  busy.value = new Set([...busy.value, s.id]);
  try { await api.runSchedule(s.id); } catch (e) { error.value = e.body?.message ?? e.message; busy.value = new Set([...busy.value].filter((x) => x !== s.id)); }
}
async function remove(s) {
  try { await api.removeSchedule(s.id); await load(); } catch (e) { error.value = e.message; }
}
// A fire ends with schedule.fired, which bumps the version and reloads: the button comes back then.
watch(() => live.schedulesVersion, () => { busy.value = new Set(); });
</script>

<template>
  <section class="card p-5" data-schedules>
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="text-[15px] font-medium">{{ heading }}</h2>
      <span class="text-[12px] text-ink-3">{{ kind === 'suite' ? 'runs every case, with nobody at the console' : 'opens every monitored page so the monitors measure' }}</span>
    </div>
    <p v-if="error" class="mt-2 text-[12.5px] text-critical">{{ error }}</p>

    <ul v-if="list?.length" class="mt-3 divide-y divide-hairline border-y border-hairline">
      <li v-for="s in list" :key="s.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5" :class="!s.enabled && 'opacity-60'">
        <label class="flex shrink-0 items-center gap-2" :title="s.enabled ? 'On — switch it off' : 'Off — switch it on'">
          <input type="checkbox" :checked="s.enabled" class="size-3.5 accent-brand" @change="toggle(s)">
        </label>
        <div class="min-w-0 flex-1">
          <p class="truncate text-[13.5px]">{{ s.name }} <span class="text-ink-3">· {{ describe(s.cron) }}</span></p>
          <p class="truncate text-[11.5px]" :class="outcomeOf(s.lastOutcome).tone">
            <template v-if="s.enabled">next {{ until(s.nextAt) }} · </template>{{ s.lastRunAt ? `last ${when(s.lastRunAt)}: ` : '' }}{{ outcomeOf(s.lastOutcome).text }}
          </p>
        </div>
        <StatusPill v-if="s.lastOutcome && outcomeOf(s.lastOutcome).ok !== null" :ok="outcomeOf(s.lastOutcome).ok" size="sm" />
        <Btn variant="ghost" size="sm" :disabled="busy.has(s.id)" @click="runNow(s)">{{ busy.has(s.id) ? 'Running…' : 'Run now' }}</Btn>
        <button type="button" class="text-ink-3 hover:text-critical" :title="`Remove ${s.name}`" :aria-label="`Remove ${s.name}`" @click="remove(s)">✕</button>
      </li>
    </ul>
    <p v-else-if="list" class="mt-3 text-[13px] text-ink-3">{{ kind === 'suite' ? 'Nothing runs on its own yet.' : 'The monitored pages are opened only when somebody opens them.' }}</p>

    <!-- Add one: a preset, or a cron line, and a name. -->
    <form class="mt-4 flex flex-wrap items-end gap-2" @submit.prevent="add">
      <label class="flex flex-col gap-1 text-[11.5px] text-ink-3">
        When
        <select v-model="preset" class="rounded-lg border border-hairline bg-panel px-2.5 py-1.5 text-[13px] text-ink">
          <option v-for="p in PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
      </label>
      <label v-if="chosen.time" class="flex flex-col gap-1 text-[11.5px] text-ink-3">
        At
        <input v-model="time" type="time" class="rounded-lg border border-hairline bg-panel px-2.5 py-1.5 text-[13px] text-ink">
      </label>
      <label v-if="chosen.custom" class="flex flex-col gap-1 text-[11.5px] text-ink-3">
        Cron (minute hour day month weekday)
        <input v-model="custom" class="w-44 rounded-lg border border-hairline bg-panel px-2.5 py-1.5 font-mono text-[12.5px] text-ink" spellcheck="false">
      </label>
      <label class="flex min-w-0 flex-1 flex-col gap-1 text-[11.5px] text-ink-3">
        Name (optional)
        <input v-model="name" maxlength="80" class="min-w-32 rounded-lg border border-hairline bg-panel px-2.5 py-1.5 text-[13px] text-ink" :placeholder="kind === 'suite' ? 'Nightly' : 'Hourly sweep'">
      </label>
      <Btn type="submit" size="sm" :disabled="adding || !cron">{{ adding ? 'Adding…' : 'Add' }}</Btn>
      <p class="basis-full text-[11.5px]" :class="addError ? 'text-critical' : 'text-ink-3'">{{ addError ?? describe(cron) }}</p>
    </form>
  </section>
</template>
