import { cn } from "@/lib/utils";

/**
 * The Trace mark — a three-point trace that resolves into a point. Used
 * wherever the copilot speaks, so its output is always visually
 * attributable and never mistaken for the app's own chrome.
 */
export function TraceMark({
  size = "md",
  plain = false,
  solid = false,
  glyphSize,
  className,
}: {
  size?: "sm" | "md" | "lg";
  plain?: boolean;
  /**
   * The conversational avatar: a solid apricot 30×30 tile at 11px radius,
   * as every turn Trace speaks in is marked. Inline uses (card heads,
   * composer lead-in) keep the tinted / plain variants.
   */
  solid?: boolean;
  /** Override the glyph size in px — used by the composer lead-in (17px). */
  glyphSize?: number;
  className?: string;
}) {
  const box = size === "lg" ? "h-9 w-9" : size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const glyph = glyphSize ?? (solid ? 15 : size === "lg" ? 18 : size === "sm" ? 11 : 13);
  return (
    <span
      className={
        solid
          ? cn("ft-tr-avatar", className)
          : cn(
              "inline-grid place-items-center rounded-lg flex-shrink-0",
              plain
                ? "text-muted-foreground"
                : "bg-primary/12 text-primary ring-1 ring-primary/20",
              box,
              className,
            )
      }
      aria-hidden
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1.5 10.5L5 6.5l2.5 2.5L12.5 3" />
        <circle cx="12.5" cy="3" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
