interface MiniDonutProps {
  /** Filled fraction in [0, 1]. Values above 1 still render as a full ring. */
  pct: number;
  size?: number;
  /** Stroke colour for the filled arc. Defaults to the primary token. */
  color?: string;
}

/**
 * Tiny utilisation donut for the budget KPI. Track and arc share the same
 * geometry; the arc is rotated −90° so 0% is at 12 o'clock.
 */
export function MiniDonut({ pct, size = 40, color }: MiniDonutProps) {
  const stroke = 3.5;
  const r = (size - stroke * 2) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="hsl(var(--bg-subtle))"
        strokeWidth={stroke}
      />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={color ?? "hsl(var(--primary))"}
        strokeWidth={stroke}
        strokeDasharray={`${circ * clamped} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`}
      />
    </svg>
  );
}
