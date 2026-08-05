import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional trailing count, rendered muted inside the button. */
  count?: number;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Accessible name for the group. */
  label?: string;
}

/**
 * The design system's segmented control: a low-profile switch between peer
 * views of the same data. Distinct from tabs, which the app uses for
 * navigating between genuinely different content.
 *
 * Scrolls horizontally rather than wrapping, so a long set of options stays
 * one row on a phone.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  label,
}: SegmentedProps<T>) {
  return (
    <div className={cn("max-w-full overflow-x-auto [scrollbar-width:none]", className)}>
      <div className="ft-seg" role="group" aria-label={label}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={cn(active && "active")}
            >
              {option.label}
              {option.count != null && (
                <span className={cn("ml-1.5", active ? "text-accent-deep" : "text-fg-dim")}>
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
