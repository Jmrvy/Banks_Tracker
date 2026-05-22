import { useTour } from "@/contexts/TourContext";
import { WelcomeModal } from "./WelcomeModal";
import { FinishModal } from "./FinishModal";
import { SpotlightStep } from "./SpotlightStep";
import { ChecklistRail } from "./ChecklistRail";
import { ChecklistChip } from "./ChecklistChip";

export function TourEngine() {
  const { state } = useTour();
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
