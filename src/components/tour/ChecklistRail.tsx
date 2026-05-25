import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useTour, CHECKLIST_STEPS, ESSENTIAL_STEPS } from "@/contexts/TourContext";
import { orderChecklist } from "./tour-config";
import { useIsMobile } from "@/hooks/use-mobile";

/** Pure content — no fixed/absolute positioning so it works in any container */
function RailContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { state, openChecklist, finish } = useTour();
  const ordered = orderChecklist(CHECKLIST_STEPS, state.goal);
  const total = ESSENTIAL_STEPS.length + CHECKLIST_STEPS.length;
  const done = state.completed.length;
  const pct = Math.min(100, Math.round((done / total) * 100));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            {t("tour.checklist.eyebrow", { defaultValue: "Discover" })}
          </div>
          <h3 className="text-[15px] font-semibold mt-0.5">
            {t("tour.checklist.title", { defaultValue: "Keep exploring" })}
          </h3>
          {/* Progress bar */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[12px] text-muted-foreground shrink-0" aria-live="polite">
              {t("tour.checklist.progress", {
                defaultValue: "{{done}} of {{total}} done",
                done,
                total,
              })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close", { defaultValue: "Close" })}
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted/50 mt-0.5 shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Step list */}
      <ul className="flex-1 overflow-y-auto p-2">
        {ordered.map((step) => {
          const isDone = state.completed.includes(step.id);
          const isActive = state.activeChecklistId === step.id;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => openChecklist(step.id)}
                aria-current={isActive ? "step" : undefined}
                className={`w-full flex items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors min-h-[52px] ${
                  isActive ? "bg-primary/10" : isDone ? "opacity-60 hover:opacity-80 hover:bg-muted/40" : "hover:bg-muted/50"
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full border-2 grid place-items-center flex-shrink-0 mt-0.5 transition-colors ${
                    isDone
                      ? "bg-primary border-primary text-primary-foreground"
                      : isActive
                      ? "border-primary"
                      : "border-border"
                  }`}
                >
                  {isDone && <Check className="h-3 w-3" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13.5px] font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
                    {t(`tour.tips.${step.id}.title`, { defaultValue: step.id })}
                  </span>
                  <span className="block text-[12px] text-muted-foreground mt-0.5 line-clamp-1">
                    {t(`tour.tips.${step.id}.body`, { defaultValue: "" })}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="border-t border-border p-3 shrink-0">
        <Button size="sm" variant="outline" onClick={finish} className="w-full h-10">
          {t("tour.finishTour", { defaultValue: "Finish tour" })}
        </Button>
      </div>
    </div>
  );
}

/** Desktop: fixed right-side panel */
function Rail() {
  const { t } = useTranslation();
  const { toggleRail } = useTour();
  return (
    <aside
      className="fixed right-0 top-0 h-screen w-[340px] z-40 bg-card border-l border-border flex flex-col shadow-xl"
      aria-label={t("tour.checklist.title", { defaultValue: "Tour checklist" })}
    >
      <RailContent onClose={toggleRail} />
    </aside>
  );
}

export function ChecklistRail() {
  const isMobile = useIsMobile();
  const { state, toggleRail, setRailOpen } = useTour();

  if (isMobile) {
    return (
      <Sheet open={!state.railDismissed} onOpenChange={setRailOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl p-0 flex flex-col"
          style={{ height: "75vh", maxHeight: "75vh" }}
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Tour checklist</SheetTitle>
          <RailContent onClose={toggleRail} />
        </SheetContent>
      </Sheet>
    );
  }

  return <Rail />;
}
