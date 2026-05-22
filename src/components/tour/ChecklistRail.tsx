import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useTour, CHECKLIST_STEPS, ESSENTIAL_STEPS } from "@/contexts/TourContext";
import { orderChecklist } from "./tour-config";
import { useIsMobile } from "@/hooks/use-mobile";

function Rail() {
  const { t } = useTranslation();
  const { state, openChecklist, toggleRail, finish } = useTour();
  const ordered = orderChecklist(CHECKLIST_STEPS, state.goal);
  const total = ESSENTIAL_STEPS.length + CHECKLIST_STEPS.length;
  const done = state.completed.length;

  return (
    <aside
      className="fixed right-0 top-0 h-screen w-[340px] z-40 bg-card border-l border-line flex flex-col shadow-xl"
      aria-label={t("tour.checklist.title", { defaultValue: "Tour checklist" })}
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-line">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            {t("tour.checklist.eyebrow", { defaultValue: "Discover" })}
          </div>
          <h3 className="text-[15px] font-semibold mt-0.5">
            {t("tour.checklist.title", { defaultValue: "Tour checklist" })}
          </h3>
          <p className="text-[12px] text-muted-foreground mt-0.5" aria-live="polite">
            {t("tour.checklist.progress", {
              defaultValue: "{{done}} of {{total}} done",
              done,
              total,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleRail}
          aria-label={t("common.close", { defaultValue: "Close" })}
          className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

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
                className={`w-full flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  isActive ? "bg-primary/10" : "hover:bg-muted/50"
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full border grid place-items-center flex-shrink-0 mt-0.5 ${
                    isDone
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-line-strong"
                  }`}
                >
                  {isDone && <Check className="h-3 w-3" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-medium">
                    {t(`tour.tips.${step.id}.title`, { defaultValue: step.id })}
                  </span>
                  <span className="block text-[12px] text-muted-foreground mt-0.5 truncate">
                    {t(`tour.tips.${step.id}.body`, { defaultValue: "" })}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line p-3">
        <Button size="sm" variant="outline" onClick={finish} className="w-full">
          {t("tour.finishTour", { defaultValue: "Finish tour" })}
        </Button>
      </div>
    </aside>
  );
}

export function ChecklistRail() {
  const isMobile = useIsMobile();
  const { state, toggleRail } = useTour();
  const { t } = useTranslation();

  if (isMobile) {
    return (
      <Sheet open={!state.railDismissed} onOpenChange={() => toggleRail()}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl p-0">
          <div className="h-[70vh] relative">
            <Rail />
          </div>
        </SheetContent>
      </Sheet>
    );
  }
  return <Rail />;
}
