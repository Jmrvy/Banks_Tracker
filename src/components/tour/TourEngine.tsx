import { useEffect } from "react";
import { useTour } from "@/contexts/TourContext";
import { WelcomeModal } from "./WelcomeModal";
import { FinishModal } from "./FinishModal";
import { SpotlightStep } from "./SpotlightStep";
import { ChecklistRail } from "./ChecklistRail";
import { ChecklistChip } from "./ChecklistChip";

export function TourEngine() {
  const { state, restart } = useTour();

  // Allow other parts of the app (e.g. Settings "Review guide") to restart
  // the tour without importing TourContext directly.
  useEffect(() => {
    const handler = () => restart();
    window.addEventListener("tour:restart", handler);
    return () => window.removeEventListener("tour:restart", handler);
  }, [restart]);

  return (
    <>
      {state.phase === "welcome" && <WelcomeModal />}
      {state.phase === "finished" && <FinishModal />}
      {(state.phase === "essentials" ||
        (state.phase === "checklist" && state.activeChecklistId)) && <SpotlightStep />}
      {state.phase === "checklist" && !state.railDismissed && <ChecklistRail />}
      {state.phase === "checklist" && state.railDismissed && state.completed.length > 0 && (
        <ChecklistChip />
      )}
    </>
  );
}

