/**
 * Schedules, as the panels speak of them. The arithmetic is the runner's
 * (schedules.js there); this is the presets a person picks from, the words
 * for a cron line, and how far off the next time is.
 */
const two = (n) => String(n).padStart(2, '0');
const parts = (time) => { const m = String(time ?? '09:00').match(/^(\d{1,2}):(\d{2})$/); return m ? [Number(m[1]), Number(m[2])] : [9, 0]; };

export const PRESETS = [
  { id: 'm15', label: 'Every 15 minutes', cron: () => '*/15 * * * *' },
  { id: 'm30', label: 'Every 30 minutes', cron: () => '*/30 * * * *' },
  { id: 'hourly', label: 'Every hour', cron: () => '0 * * * *' },
  { id: 'daily', label: 'Every day at…', time: true, cron: (t) => { const [h, m] = parts(t); return `${m} ${h} * * *`; } },
  { id: 'weekdays', label: 'Weekdays at…', time: true, cron: (t) => { const [h, m] = parts(t); return `${m} ${h} * * 1-5`; } },
  { id: 'custom', label: 'A cron line', custom: true },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** A cron line in words, for the shapes the presets make; anything else as it is. */
export function describe(cron) {
  const f = String(cron ?? '').trim().split(/\s+/);
  if (f.length !== 5) return String(cron ?? '');
  const [m, h, dom, mon, dow] = f;
  const at = (hh, mm) => `${two(hh)}:${two(mm)}`;
  if (dom === '*' && mon === '*') {
    if (h === '*' && m === '*') return 'every minute';
    if (h === '*' && /^\*\/\d+$/.test(m)) return `every ${m.slice(2)} minutes`;
    if (h === '*' && /^\d+$/.test(m)) return `hourly at :${two(m)}`;
    if (/^\*\/\d+$/.test(h) && /^\d+$/.test(m)) return `every ${h.slice(2)} hours at :${two(m)}`;
    if (/^\d+$/.test(h) && /^\d+$/.test(m)) {
      if (dow === '*') return `daily at ${at(h, m)}`;
      if (dow === '1-5') return `weekdays at ${at(h, m)}`;
      if (dow === '0,6' || dow === '6,0') return `weekends at ${at(h, m)}`;
      if (/^[0-6](,[0-6])*$/.test(dow)) return `${dow.split(',').map((d) => DAYS[Number(d)]).join(', ')} at ${at(h, m)}`;
    }
  }
  return `cron ${f.join(' ')}`;
}

/** "in 12 min", "in 3 h", "tomorrow 09:00" — how far off a time is. */
export function until(ms, now = Date.now()) {
  if (ms == null) return 'never within a year';
  const d = ms - now;
  if (d <= 0) return 'now';
  const min = Math.round(d / 60_000);
  if (min < 60) return `in ${min} min`;
  const h = Math.round(d / 3_600_000);
  if (h < 24) return `in ${h} h`;
  const t = new Date(ms);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const day = t.toDateString() === tomorrow.toDateString() ? 'tomorrow' : `${DAYS[t.getDay()]} ${t.getDate()}`;
  return `${day} ${two(t.getHours())}:${two(t.getMinutes())}`;
}

/** What the last fire came to, in a few words and a tone. */
export function outcomeOf(o) {
  if (!o) return { text: 'not run yet', tone: 'text-ink-3', ok: null };
  if (o.missed) return { text: 'missed — the runner was busy', tone: 'text-warn', ok: false };
  if (o.error) return { text: o.error, tone: 'text-critical', ok: false };
  if (o.pages != null) return { text: o.note ?? `swept ${o.pages} of ${o.of} page${o.of === 1 ? '' : 's'}${o.openIncidents ? `, ${o.openIncidents} open incident${o.openIncidents === 1 ? '' : 's'}` : ''}`, tone: o.ok ? 'text-ink-2' : 'text-critical', ok: !!o.ok };
  return { text: `${o.passed}/${o.total} passed`, tone: o.ok ? 'text-ink-2' : 'text-critical', ok: !!o.ok };
}
