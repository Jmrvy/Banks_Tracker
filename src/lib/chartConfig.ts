export const CHART_COLORS = [
  'hsl(340, 75%, 60%)',
  'hsl(38, 70%, 68%)',
  'hsl(200, 75%, 60%)',
  'hsl(150, 65%, 55%)',
  'hsl(280, 70%, 65%)',
  'hsl(25, 75%, 60%)',
  'hsl(210, 15%, 50%)',
  'hsl(170, 60%, 50%)',
  'hsl(350, 65%, 55%)',
  'hsl(45, 80%, 60%)',
];

export const CHART_SEMANTIC = {
  primary: 'hsl(var(--primary))',
  success: 'hsl(var(--success))',
  destructive: 'hsl(var(--destructive))',
  muted: 'hsl(var(--muted-foreground))',
  border: 'hsl(var(--border))',
  principal: 'hsl(var(--success))',
  interest: 'hsl(200, 75%, 60%)',
  insurance: 'hsl(280, 70%, 65%)',
};

export const TOOLTIP_CLASS =
  'bg-popover border border-line rounded-lg shadow-md p-2.5 sm:p-3 text-xs';

export const AXIS_TICK = {
  fontSize: 10,
  fill: 'hsl(var(--muted-foreground))',
};

export const GRID_PROPS = {
  strokeDasharray: '3 3' as const,
  stroke: 'hsl(var(--border))',
  opacity: 0.3,
};

export const formatAxisValue = (value: number): string => {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return value.toString();
};
