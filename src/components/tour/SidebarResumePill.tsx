import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { useTour } from "@/contexts/TourContext";

export function SidebarResumePill() {
  const { t } = useTranslation();
  const { state, openChecklist, toggleRail, totalSteps } = useTour();
  const done = state.completed.length;

  if (state.phase === "welcome" || state.phase === "essentials") return null;
  if (done === 0 || done >= totalSteps) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (state.railDismissed) toggleRail();
        // ensure phase is checklist
        openChecklist("");
      }}
      className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-left hover:bg-primary/10 transition-colors"
    >
      <Sparkles className="h-3.5 w-3.5 text-primary" />
      <span className="text-[12px] font-medium text-foreground flex-1">
        {t("tour.resumePill", { defaultValue: "Resume tour" })}
      </span>
      <span className="text-[11px] font-mono text-muted-foreground">
        {done}/{totalSteps}
      </span>
    </button>
  );
}
