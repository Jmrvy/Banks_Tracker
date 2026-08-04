import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTrace } from "@/contexts/TraceContext";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * The copilot's standing invitation — one floating affordance, bottom-right
 * on desktop and above the tab bar on mobile. It opens the existing dock
 * rather than introducing a third Trace surface, so there is still only ever
 * one Trace open at a time.
 *
 * Hidden on `/trace` (Trace is already the whole page) and while the dock or
 * modal is open (the button would sit on top of its own panel).
 */
export function TraceFab() {
  const { t } = useTranslation();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { openDock, surface } = useTrace();

  if (location.pathname.startsWith("/trace")) return null;
  if (surface !== "closed") return null;

  const label = t("trace.askTrace", { defaultValue: "Ask Trace" });

  return (
    <button
      type="button"
      onClick={openDock}
      aria-label={label}
      title={label}
      className={cn(
        "ft-fab",
        // Clears the mobile tab bar; sits in the page corner on desktop.
        isMobile ? "right-4 bottom-[104px] h-[54px] w-[54px] rounded-[19px]" : "right-6 bottom-6"
      )}
    >
      <span className="ring" aria-hidden />
      <svg
        width={isMobile ? 23 : 24}
        height={isMobile ? 23 : 24}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.6 10.4 12.2 5 10.6 10.4 9 12 3.5ZM18.5 16.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" />
      </svg>
    </button>
  );
}
