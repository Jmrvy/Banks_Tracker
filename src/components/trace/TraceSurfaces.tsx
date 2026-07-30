import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Eye, Maximize2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TraceComposer, TraceThread, useTraceSuggestions } from "@/components/trace/TraceThread";
import { TraceMark } from "@/components/trace/TraceMark";
import { useTrace } from "@/contexts/TraceContext";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Surface 2 — the dock. Contextual to the page behind it: a right rail on
 * desktop, a bottom sheet on mobile. Trace states which page it is
 * watching so a question like "why is this over?" has an obvious referent.
 */
function TraceDockBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { pageContext, turns } = useTrace();
  const suggestions = useTraceSuggestions();

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line flex-shrink-0">
        <TraceMark />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold tracking-tight">Trace</div>
          <div className="text-[11px] text-muted-foreground">
            {t("trace.watchingPage", { defaultValue: "watching this page" })}
          </div>
        </div>
        <Link
          to="/trace"
          onClick={onClose}
          aria-label={t("trace.openFull", { defaultValue: "Open Trace" })}
          className="h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:bg-bg-hover hover:text-foreground transition-colors"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close", { defaultValue: "Close" })}
          className="h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:bg-bg-hover hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="px-4 pt-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-bg-subtle/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <Eye className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">
              {t("trace.context", { defaultValue: "Context" })}:{" "}
              <b className="text-foreground font-medium">{pageContext}</b>
            </span>
          </div>
        </div>

        {turns.length === 0 ? (
          <div className="flex-1 px-4 py-6 text-sm text-muted-foreground">
            {t("trace.dockEmpty", {
              defaultValue:
                "Ask about what you're looking at. Trace reads your ledger to answer, and proposes changes you confirm.",
            })}
          </div>
        ) : (
          <TraceThread className="flex-1 min-h-0 px-4 py-4" />
        )}
      </div>

      <div className="px-4 py-3 border-t border-line flex-shrink-0">
        <TraceComposer
          suggestions={turns.length === 0 ? suggestions.slice(0, 3) : undefined}
          compact={turns.length > 0}
          placeholder={t("trace.placeholderPage", { defaultValue: "Ask about this page…" })}
        />
      </div>
    </div>
  );
}

/**
 * Surface 3 — the modal, escalated out of ⌘K. Used when the palette's
 * deterministic parser can't build the query the user typed.
 */
function TraceModalBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { turns } = useTrace();
  const suggestions = useTraceSuggestions();

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line flex-shrink-0">
        <TraceMark />
        <div className="text-sm font-semibold tracking-tight flex-1">Trace</div>
        <Link
          to="/trace"
          onClick={onClose}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("trace.openFull", { defaultValue: "Open Trace" })}
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close", { defaultValue: "Close" })}
          className="h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:bg-bg-hover hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {turns.length === 0 ? (
        <div className="flex-1 px-4 py-6 text-sm text-muted-foreground">
          {t("trace.modalEmpty", {
            defaultValue: "Ask anything about your money. Every figure comes from your own ledger.",
          })}
        </div>
      ) : (
        <TraceThread className="flex-1 min-h-0 px-4 py-4" />
      )}

      <div className="px-4 py-3 border-t border-line flex-shrink-0">
        <TraceComposer
          autoFocus
          suggestions={turns.length === 0 ? suggestions.slice(0, 3) : undefined}
          compact={turns.length > 0}
        />
      </div>
    </div>
  );
}

/**
 * Mounts whichever surface is active. One instance lives in the app shell;
 * everything else just calls `openDock()` / `openModal()`.
 */
export function TraceSurfaces() {
  const { t } = useTranslation();
  const { surface, close } = useTrace();
  const isMobile = useIsMobile();

  // Escape closes whichever surface is up, matching the palette.
  useEffect(() => {
    if (surface === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [surface, close]);

  if (surface === "closed") return null;

  if (surface === "dock") {
    return (
      <Sheet open onOpenChange={(open) => !open && close()}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          hideClose
          className={
            isMobile
              ? "h-[85vh] p-0 flex flex-col gap-0 rounded-t-2xl"
              : "w-full sm:max-w-[420px] p-0 flex flex-col gap-0"
          }
        >
          {/* Radix requires a labelled dialog; the visible header carries
              the same name, so these are screen-reader only. */}
          <SheetTitle className="sr-only">Trace</SheetTitle>
          <SheetDescription className="sr-only">
            {t("trace.a11yDock", { defaultValue: "Trace copilot, scoped to the current page" })}
          </SheetDescription>
          <TraceDockBody onClose={close} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent
        side={isMobile ? "bottom" : "top"}
        hideClose
        className={
          isMobile
            ? "h-[88vh] p-0 flex flex-col gap-0 rounded-t-2xl"
            : "mx-auto w-full sm:max-w-2xl max-h-[80vh] mt-[6vh] rounded-2xl p-0 flex flex-col gap-0 border"
        }
      >
        <SheetTitle className="sr-only">Trace</SheetTitle>
        <SheetDescription className="sr-only">
          {t("trace.a11yModal", { defaultValue: "Trace copilot" })}
        </SheetDescription>
        <TraceModalBody onClose={close} />
      </SheetContent>
    </Sheet>
  );
}
