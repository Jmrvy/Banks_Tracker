import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  /** Lucide icon rendered inside a tinted square. */
  icon?: LucideIcon;
  title: string;
  /** Short paragraph (≤ 2 lines). Optional. */
  body?: string;
  /** Primary call-to-action node — usually a `<Button>`. */
  action?: React.ReactNode;
  /** Optional secondary CTA. */
  secondaryAction?: React.ReactNode;
  /** Tone for the icon tile. Defaults to `muted`. */
  tone?: "muted" | "warning" | "danger";
  className?: string;
}

/**
 * Single empty-state primitive used across blank screens. Replaces the
 * one-off "no data" panels that previously lived inside individual pages so
 * Transactions / Accounts / Debts / Savings / Recurring / Installments all
 * read with the same restraint and copy structure.
 *
 * Visuals follow the audit's recommendation: a single muted-line tile, no
 * stock illustrations, ≤ 2 sentences of body, one primary CTA.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondaryAction,
  tone = "muted",
  className,
}: EmptyStateProps) {
  const tileClass =
    tone === "warning"
      ? "bg-warning/12 text-warning"
      : tone === "danger"
      ? "bg-destructive/12 text-destructive"
      : "bg-bg-subtle text-muted-foreground border border-line";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-3 px-6 py-10 sm:py-14",
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            "h-10 w-10 rounded-xl grid place-items-center flex-shrink-0",
            tileClass
          )}
          aria-hidden
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
      )}
      <div className="flex flex-col gap-1.5 max-w-sm">
        <p className="text-[14.5px] font-semibold tracking-tight text-foreground">{title}</p>
        {body && <p className="text-[13px] text-muted-foreground leading-relaxed">{body}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
