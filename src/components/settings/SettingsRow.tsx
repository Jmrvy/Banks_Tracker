import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * One settings row. The design gives every setting the same rhythm — label
 * and hint on the left capped at 48ch, the control hard-right — and rules
 * each row off with its own soft top border rather than dropping filler
 * separators between them.
 *
 * `stack` puts the control on its own full-width line underneath, for
 * controls that wrap (chip multi-selects, alias lists).
 */
export function SettingsRow({
  label,
  hint,
  htmlFor,
  stack = false,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  stack?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex border-t border-line-soft py-[13px]",
        stack
          ? "flex-col items-stretch gap-2.5"
          : "flex-wrap items-center justify-between gap-x-[22px] gap-y-2.5",
        className,
      )}
    >
      <div className={stack ? "min-w-0" : "min-w-0 max-w-[48ch]"}>
        <Label htmlFor={htmlFor} className="text-[13.5px] font-semibold">
          {label}
        </Label>
        {/* A div, not a <p>: some hints carry a list (the iOS install
            steps), which the browser would hoist out of a paragraph. */}
        {hint && <div className="text-[12px] text-fg-mute mt-[2px]">{hint}</div>}
      </div>
      {children && <div className={stack ? "min-w-0" : "flex-shrink-0"}>{children}</div>}
    </div>
  );
}

/** The 190×34 control box the design uses for every settings dropdown. */
export const SETTINGS_CONTROL = "w-[190px] h-[34px] text-[13px]";
