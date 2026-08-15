import { useEffect } from "react";

/**
 * Makes every Recharts chart in the app behave on a touch screen. Mounted
 * once at the root; charts need do nothing to opt in.
 *
 * Recharts was built for a pointer, and on a phone that showed in one place:
 * a tapped tooltip had no way to leave. Recharts clears it on mouseleave, an
 * event a finger never fires, so the last touched point stayed haloed with
 * its tooltip pinned until the user navigated away — and tapping a second
 * chart left two readouts on screen at once, neither of them current.
 *
 * Clearing on touchend was the obvious fix and the wrong one: on touch the
 * lingering tooltip IS the readout, and erasing it the moment the finger
 * lifts means the value is never actually read. So it survives until the
 * user touches something else, at which point the chart is sent the
 * bubbling `mouseout` its own handler listens for (React synthesises
 * `onMouseLeave` from native mouseout at the root).
 *
 * The companion rule — a vertical swipe starting on a chart scrolls the page
 * rather than being swallowed by the SVG — is `touch-action: pan-y`, applied
 * to `.recharts-responsive-container` in index.css for the same reason this
 * is global: per-chart opt-in is a rule every future chart can forget.
 */
export function useChartTouch(): void {
  useEffect(() => {
    // The chart currently showing a touch-raised tooltip, if any.
    let showing: Element | null = null;

    const clear = (wrapper: Element) => {
      wrapper.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          // A leave only counts when the pointer went somewhere else;
          // pointing relatedTarget at the body makes it read as "left the
          // chart entirely" rather than a move between its own children.
          relatedTarget: document.body,
        } as MouseEventInit),
      );
    };

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      const wrapper = target?.closest?.(".recharts-wrapper") ?? null;
      if (showing && showing !== wrapper) clear(showing);
      showing = wrapper;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => document.removeEventListener("touchstart", onTouchStart);
  }, []);
}
