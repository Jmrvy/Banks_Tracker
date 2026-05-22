import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { useTour } from "@/contexts/TourContext";
import "./tour.css";

export function ChecklistChip() {
  const { t } = useTranslation();
  const { state, toggleRail, totalSteps } = useTour();
  const done = state.completed.length;
  const pct = Math.min(100, Math.round((done / totalSteps) * 100));
  const C = 2 * Math.PI * 9;
  const offset = C - (pct / 100) * C;

  return (
    <button type="button" onClick={toggleRail} className="tour-chip" aria-label={t("tour.resume", { defaultValue: "Resume tour" })}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r="9" fill="none" stroke="hsl(var(--muted))" strokeWidth="2" />
        <circle
          cx="11"
          cy="11"
          r="9"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform="rotate(-90 11 11)"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-medium">
        {t("tour.resumePill", { defaultValue: "Resume tour" })} · {done}/{totalSteps}
      </span>
      <Sparkles className="h-3.5 w-3.5 text-primary" />
    </button>
  );
}
