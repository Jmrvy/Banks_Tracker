import { cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/categoryIcons";

interface CategoryIconProps {
  /** Lucide icon name stored on the category, or null. */
  icon: string | null | undefined;
  /** Category color (HEX). Used as the icon tint and as the fallback dot color. */
  color: string;
  /** Pixel size of the swatch. Defaults to 24. */
  size?: number;
  className?: string;
}

/**
 * Renders the category badge: a tinted square with the icon if one is set,
 * otherwise a simple coloured dot (legacy behaviour).
 */
export function CategoryIcon({ icon, color, size = 24, className }: CategoryIconProps) {
  const Icon = getCategoryIcon(icon);
  if (!Icon) {
    const dot = Math.max(8, Math.round(size * 0.5));
    return (
      <span
        aria-hidden
        className={cn("inline-block rounded-full flex-shrink-0", className)}
        style={{ width: dot, height: dot, background: color }}
      />
    );
  }
  const iconSize = Math.round(size * 0.58);
  return (
    <span
      aria-hidden
      className={cn("inline-flex items-center justify-center rounded-lg flex-shrink-0", className)}
      style={{
        width: size,
        height: size,
        background: `${color}1F`, // ~12% alpha
        color,
      }}
    >
      <Icon style={{ width: iconSize, height: iconSize }} strokeWidth={2} />
    </span>
  );
}
