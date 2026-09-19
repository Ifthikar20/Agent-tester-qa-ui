/**
 * Charts, drawn one way everywhere: the runs on the dashboard, the runs
 * under a chat reply, a table somebody attached — one component (Chart.vue)
 * over Chart.js, reading its colours from the theme's own tokens (app.css)
 * so a chart looks like the page it sits on, in the light and in the dark.
 *
 * A chart arrives as a SPEC, never as configuration: `{ type, labels,
 * series: [{ name, values, role }], stacked, horizontal, unit }` — the shape
 * the runner's chat-charts.js emits and the pages build for themselves. A
 * spec carries data and roles; every colour, font and axis rule is decided
 * here, which is what keeps a chart a person asked for in words from being
 * able to say anything about how it is drawn.
 *
 * The rules are the dashboard's, kept from RunsChart before it: failures
 * carry the colour and passes stay neutral (a red/green pair separates by
 * only ΔE 4 under deuteranopia); status and severity wear the status tokens;
 * any other series takes one of four hues in a fixed order (validated
 * together against both surfaces: ΔE ≥ 8 between neighbours, ≥ 3:1 on the
 * panel in the dark); thin marks with a 2px surface gap between stacked
 * segments; a hairline grid, one axis, a legend only for two series or more.
 */
import {
  BarController, BarElement, CategoryScale, Chart, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip,
} from 'chart.js';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);
Chart.defaults.font.family = '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
Chart.defaults.font.size = 11;

/** The theme's tokens, read at draw time so a flip to the dark redraws in its colours. */
export function paint() {
  const css = getComputedStyle(document.documentElement);
  const token = (name, fallback) => (css.getPropertyValue(name) || '').trim() || fallback;
  return {
    panel: token('--color-panel', '#ffffff'),
    ink: token('--color-ink', '#101014'),
    ink2: token('--color-ink-2', '#5a5a66'),
    ink3: token('--color-ink-3', '#6f6f7c'),
    hairline: token('--color-hairline', '#eaeaef'),
    pass: token('--color-pass', '#8b8983'),
    fail: token('--color-fail', '#d03b3b'),
    critical: token('--color-critical', '#d03b3b'),
    warn: token('--color-warn', '#a86b00'),
    good: token('--color-good', '#0ca30c'),
    series: [token('--color-series-1', '#2a78d6'), token('--color-series-2', '#eb6834'), token('--color-series-3', '#1baf7a'), token('--color-series-4', '#eda100')],
  };
}

/** A hex colour at an opacity, for the wash under a line. */
const wash = (hex, alpha = 0.12) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` : hex);

const fmt = (v, unit = '') => (v == null ? '' : `${Number(v).toLocaleString()}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `2026-09-17` → `Sep 17`; anything else as it is. */
export const shortLabel = (label, x) => {
  const m = x === 'date' ? String(label).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/) : null;
  if (!m) return String(label);
  return m[3] ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
};

/** The colour a role wears — a series index picks its hue in the fixed order. */
export function colourFor(role, i, p) {
  switch (role) {
    case 'pass': return p.pass;
    case 'fail': return p.fail;
    case 'critical': return p.critical;
    case 'warn': return p.warn;
    case 'good': return p.good;
    case 'neutral': return p.pass;
    default: return p.series[i % p.series.length];
  }
}

/**
 * A spec → the Chart.js configuration that draws it. Pure over the spec
 * and the palette, so a test can pin what a role becomes.
 */
export function build(spec, p = paint(), { legend = true } = {}) {
  const horizontal = !!spec.horizontal;
  const stacked = !!spec.stacked;
  const line = spec.type === 'line';
  const unit = spec.unit ?? '';
  const labels = (spec.labels ?? []).map((l) => shortLabel(l, spec.x));
  const series = spec.series ?? [];
  const datasets = series.map((s, i) => {
    const colour = colourFor(s.role, i, p);
    if (line) {
      return {
        label: s.name, data: s.values,
        // backgroundColor is what the legend's swatch is filled with; the area
        // under a lone line takes its own wash below, and the points their own.
        backgroundColor: colour, borderColor: colour, borderWidth: 2, tension: 0.25,
        pointRadius: 4, pointHoverRadius: 5, pointBackgroundColor: colour, pointBorderColor: p.panel, pointBorderWidth: 2,
        fill: series.length === 1 ? { target: 'origin', above: wash(colour) } : false,
      };
    }
    return {
      label: s.name, data: s.values,
      backgroundColor: Array.isArray(s.roles) ? s.roles.map((r, k) => colourFor(r, k, p)) : colour,
      hoverBackgroundColor: Array.isArray(s.roles) ? s.roles.map((r, k) => colourFor(r, k, p)) : colour,
      // The surface gap between stacked segments, in the surface's own colour.
      borderColor: p.panel, borderWidth: stacked ? (horizontal ? { right: 2 } : { top: 2 }) : 0, borderSkipped: false,
      borderRadius: 4, maxBarThickness: 24, categoryPercentage: 0.7, barPercentage: 0.9,
    };
  });
  const valueAxis = { beginAtZero: true, stacked, grid: { color: p.hairline, drawTicks: false }, border: { display: false }, ticks: { color: p.ink3, precision: 0, maxTicksLimit: 5, padding: 6, callback: (v) => fmt(v, unit) } };
  const labelAxis = { stacked, grid: { display: false }, border: { display: false }, ticks: { color: p.ink3, maxRotation: 0, autoSkipPadding: 12, padding: 4 } };
  return {
    type: line ? 'line' : 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 4, right: 4 } },
      plugins: {
        // A square swatch for every series, line or bar: the point style would
        // stroke a line in the point's border colour, which is the surface's.
        legend: { display: series.length > 1 && legend, position: 'bottom', labels: { color: p.ink2, boxWidth: 10, boxHeight: 10, padding: 12 } },
        tooltip: {
          backgroundColor: p.panel, titleColor: p.ink, bodyColor: p.ink2, borderColor: p.hairline, borderWidth: 1, padding: 8, cornerRadius: 8,
          displayColors: series.length > 1, boxWidth: 8, boxHeight: 8, boxPadding: 3,
          callbacks: { label: (c) => `${series.length > 1 ? `${c.dataset.label}: ` : ''}${fmt(horizontal ? c.parsed.x : c.parsed.y, unit)}` },
        },
      },
      scales: horizontal ? { x: valueAxis, y: labelAxis } : { x: labelAxis, y: valueAxis },
    },
  };
}

/** Runs per day, as the pages spec it for themselves from `summary().days`. */
export const runsSpec = (days, title = 'Runs per day') => ({
  kind: 'chart', type: 'bar', stacked: true, x: 'date', title, subtitle: `the last ${days?.length ?? 0} days`,
  labels: (days ?? []).map((d) => new Date(Number(d.day)).toISOString().slice(0, 10)),
  series: [
    { name: 'Passed', values: (days ?? []).map((d) => d.passed), role: 'pass' },
    { name: 'Failed', values: (days ?? []).map((d) => d.failed), role: 'fail' },
  ],
});

/** One number per name, sideways: cases by suite, and the like. */
export const countsSpec = (title, rows, { name = 'name', value = 'value', roles = null, horizontal = true, unit = '' } = {}) => ({
  kind: 'chart', type: 'bar', horizontal, unit, title,
  labels: rows.map((r) => r[name]),
  series: [{ name: title, values: rows.map((r) => Number(r[value]) || 0), role: 'neutral', ...(roles ? { roles: rows.map((r) => roles(r)) } : { role: 'series' }) }],
});

export { Chart };
