import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** DOM id of the slot the Scheduled page reserves in its header row. */
export const SCHEDULED_HEAD_SLOT_ID = "scheduled-head-cta";

/**
 * Renders its children into the Scheduled page header.
 *
 * The three tools embedded in `/scheduled` each own their own primary action,
 * but the page owns the header those actions belong in. Rather than lifting
 * three modals up a level, each tool keeps its button and posts it into the
 * header slot while it is the active tab. Renders nothing when the slot is
 * absent — which is exactly the standalone-route case, where the tool draws
 * its own page head.
 */
export function ScheduledHeadSlot({ children }: { children: React.ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);

  // Read after mount: the slot belongs to the parent, which is already
  // committed by the time a lazily-loaded tab body renders.
  useEffect(() => {
    setNode(document.getElementById(SCHEDULED_HEAD_SLOT_ID));
  }, []);

  return node ? createPortal(children, node) : null;
}
