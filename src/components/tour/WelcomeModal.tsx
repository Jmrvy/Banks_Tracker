import { useTranslation } from "react-i18next";
import { Sparkles, TrendingUp, PiggyBank, Scale } from "lucide-react";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTour } from "@/contexts/TourContext";
import type { TourGoal } from "./tour-config";

const GOALS: { id: TourGoal; icon: typeof TrendingUp; keyBase: string }[] = [
  { id: "track", icon: TrendingUp, keyBase: "tour.goals.track" },
  { id: "save", icon: PiggyBank, keyBase: "tour.goals.save" },
  { id: "debt", icon: Scale, keyBase: "tour.goals.debt" },
];

export function WelcomeModal() {
  const { t } = useTranslation();
  const { state, setGoal, skipAll, startEssentials } = useTour();
  const open = state.phase === "welcome";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && skipAll()}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col items-center text-center mb-2">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-3">
            <Sparkles className="h-6 w-6" />
          </div>
          <DialogTitle className="text-xl font-bold">
            {t("tour.welcome.title", { defaultValue: "Quick tour of Banks Tracker" })}
          </DialogTitle>
          <DialogDescription className="mt-1.5">
            {t("tour.welcome.body", {
              defaultValue:
                "Pick a goal and we'll highlight what matters first — then leave a checklist you can resume any time.",
            })}
          </DialogDescription>
        </div>

        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            {t("tour.welcome.pickGoal", { defaultValue: "What brings you here?" })}
          </div>
          <div className="grid gap-2">
            {GOALS.map(({ id, icon: Icon, keyBase }) => {
              const active = state.goal === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setGoal(id)}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary/5"
                      : "border-line bg-card hover:border-primary/40"
                  }`}
                >
                  <span
                    className={`h-9 w-9 rounded-lg grid place-items-center flex-shrink-0 ${
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold">
                      {t(`${keyBase}.title`, { defaultValue: id })}
                    </span>
                    <span className="block text-[12.5px] text-muted-foreground mt-0.5">
                      {t(`${keyBase}.body`, { defaultValue: "" })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-4 mt-2 border-t border-line">
          <Button variant="ghost" size="sm" onClick={skipAll} className="text-muted-foreground">
            {t("tour.skipAll", { defaultValue: "Skip tour" })}
          </Button>
          <Button size="sm" onClick={startEssentials} className="px-4">
            {t("tour.welcome.start", { defaultValue: "Start tour" })}
          </Button>
            {t("tour.welcome.start", { defaultValue: "Start tour" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
