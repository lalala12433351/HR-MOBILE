/** Shared chart tokens for Reports & Analytics — aligned with TeamHub chart craft + app blue brand. */

export const CHART_PALETTE = [
  '#2563eb', // primary blue
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#6366f1', // indigo
  '#64748b', // slate
] as const;

export const CHART_MUTED = '#cbd5e1';
export const CHART_TRACK = '#eef2f7';
export const CHART_PRIMARY = '#2563eb';
export const CHART_ACCENT = '#10b981';

export const chartAxisTick = {
  fontSize: 11,
  fill: '#64748b',
  fontFamily: 'var(--font-plus-jakarta), Plus Jakarta Sans, sans-serif',
} as const;

export const chartAxisTickSm = {
  ...chartAxisTick,
  fontSize: 10,
} as const;

export const chartGridProps = {
  strokeDasharray: '0',
  vertical: false,
  stroke: '#eef2f7',
} as const;

export const chartMargin = { top: 12, right: 8, left: -12, bottom: 0 } as const;

/** Soft pill-top bars like TeamHub Performance / Dashboard charts */
export const BAR_RADIUS: [number, number, number, number] = [10, 10, 0, 0];
export const BAR_MAX_SIZE = 44;

export const DONUT = {
  innerRadius: 52,
  outerRadius: 74,
  paddingAngle: 3,
  stroke: '#ffffff',
  strokeWidth: 3,
} as const;

export function chartColorAt(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}
