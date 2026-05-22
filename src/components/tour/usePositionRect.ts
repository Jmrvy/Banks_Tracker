import { useEffect, useState } from "react";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Track a DOM element's viewport-relative rectangle by CSS selector.
 *
 * Re-resolves on resize, scroll (capture phase, all scroll containers),
 * and DOM mutations. Returns `null` until the element is found.
 *
 * The hook polls with `requestAnimationFrame` while the element is
 * missing so lazy-loaded routes settle without callers having to
 * coordinate manually.
 */
export function usePositionRect(
  selector: string | null,
  deps: ReadonlyArray<unknown> = [],
): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }

    let cancelled = false;
    let rafId = 0;

    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return false;
      }
      const r = el.getBoundingClientRect();
      setRect((prev) => {
        if (
          prev &&
          prev.top === r.top &&
          prev.left === r.left &&
          prev.width === r.width &&
          prev.height === r.height
        ) {
          return prev;
        }
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      });
      return true;
    };

    // Initial poll loop while the anchor mounts.
    const poll = () => {
      if (cancelled) return;
      if (!measure()) {
        rafId = window.requestAnimationFrame(poll);
      }
    };
    poll();

    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);

    const ro = new ResizeObserver(onChange);
    ro.observe(document.body);

    const mo = new MutationObserver(onChange);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });

    const interval = window.setInterval(measure, 250);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      ro.disconnect();
      mo.disconnect();
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ...deps]);

  return rect;
}
