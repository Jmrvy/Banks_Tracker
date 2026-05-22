import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTour } from "@/contexts/TourContext";

export function FinishModal() {
  const { t } = useTranslation();
  const { state, skipAll } = useTour();
  const open = state.phase === "finished";
  const goal = state.goal ?? "track";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && skipAll()}>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <div className="flex flex-col items-center text-center">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-3">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <DialogTitle className="text-xl font-bold">
            {t(`tour.finish.${goal}.title`, { defaultValue: "You're all set" })}
          </DialogTitle>
          <DialogDescription className="mt-1.5">
            {t(`tour.finish.${goal}.body`, {
              defaultValue: "Resume the tour any time from Settings → Restart guided tour.",
            })}
          </DialogDescription>
        </div>
        <div className="flex justify-center pt-4">
          <Button onClick={skipAll}>{t("common.gotIt", { defaultValue: "Got it" })}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
