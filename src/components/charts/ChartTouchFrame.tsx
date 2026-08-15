import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one wrapper every Recharts chart sits in.
 *
 * Touch never got first-class treatment: charts sat directly in the page,
 * so on a phone two things went wrong at once. A vertical swipe that
 * started on a chart was swallowed by the SVG instead of scrolling the
 * page, and a tap raised a tooltip that then had no way to leave — Recharts
 * clears it on mouseleave, an event a finger never fires — so the last
 * touched point stayed haloed with its tooltip pinned until navigation.
 *
 * Three rules restore native feel, all contained here so charts opt in by
 * wrapping rather than each reimplementing them:
 *
 *  - `touch-action: pan-y` on the frame: a vertical drag scrolls the page,
 *    while horizontal movement still scrubs the chart.
 *  - A tap-and-hold or scrub shows the tooltip exactly as Recharts already
 *    does; nothing to add.
 *  - Touching anywhere OUTSIDE the frame clears it, by dispatching the
 *    bubbling `mouseout` Recharts' outer div listens for (React synthesises
 *    its `onMouseLeave` from native mouseout at the root). Clearing on
 *    touchend instead would mean the value vanishes the moment the finger
 *    lifts — on touch the lingering tooltip IS the readout, so it stays
 *    until the user moves on.
 */
export function ChartTouchFrame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const touchedRef = useRef(false);

  useEffect(() => {
    const onDocTouchStart = (e: TouchEvent) => {
      const frame = frameRef.current;
      if (!frame || !touchedRef.current) return;
      if (frame.contains(e.target as Node)) return;
      touchedRef.current = false;
      const surface = frame.querySelector(".recharts-wrapper");
      surface?.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          // A leave only counts when the pointer went somewhere else;
          // pointing relatedTarget at the body makes it read as "left the
          // chart entirely" rather than a move between children.
          relatedTarget: document.body,
        } as MouseEventInit),
      );
    };
    document.addEventListener("touchstart", onDocTouchStart, { passive: true });
    return () => document.removeEventListener("touchstart", onDocTouchStart);
  }, []);

  return (
    <div
      ref={frameRef}
      className={cn("relative [touch-action:pan-y]", className)}
      onTouchStart={() => {
        touchedRef.current = true;
      }}
    >
      {children}
    </div>
  );
}
