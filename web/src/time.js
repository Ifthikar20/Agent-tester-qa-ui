/**
 * Times, as a person reads them.
 *
 * `when` is the relative form the dashboard, the defects page and a suite's
 * runs each carry a copy of; the monitoring page uses this one. `clock` is the
 * exact form an incident needs beside it: the relative time is the glance,
 * the clock time is the evidence.
 */
export const when = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

export const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
