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
  /**
   * Let the scroller run to the screen edge on a phone by cancelling the
   * page's 16px gutter. Opt-in, because the negative margin only works when
   * the control owns its row and the row is the page's own width: inside a
   * flex row it drags the control out of line with its siblings, and inside
   * any padded box (a popover, a card) it overflows. Default off.
   */
  bleed?: boolean;
}

/**
 * The design system's segmented control: a low-profile switch between peer
 * views of the same data. Distinct from tabs, which the app uses for
 * navigating between genuinely different content.
 *
 * Scrolls horizontally rather than wrapping, so a long set of options stays
 * one row on a phone.
 *
 * Call it as `<Segmented …>`, never `<Segmented<Foo> …>`. The dev-only
 * `lovable-tagger` plugin injects `data-lov-*` attributes between the
 * component name and the type argument, and the result no longer parses —
 * the page is replaced by an error overlay in `npm run dev` while `vite
 * build`, tests and CI all stay green. Narrow in the handler instead:
 * `onChange={(v) => setFoo(v as Foo)}`.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  label,
  bleed = false,
}: SegmentedProps<T>) {
  return (
    // When bled, the scroller runs to the screen edge so a cut-off option
    // reads as "more to scroll" rather than "truncated".
    // `.ft-noscroll` hides the bar in WebKit as well as Firefox/Safari.
    <div
      className={cn(
        "max-w-full overflow-x-auto ft-noscroll",
        bleed && "-mx-4 px-4 md:mx-0 md:px-0",
        className,
      )}
    >
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
