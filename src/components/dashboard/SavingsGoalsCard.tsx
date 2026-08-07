import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PiggyBank, Plus } from "lucide-react";
import { useSavingsGoals } from "@/hooks/useSavingsGoals";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

/**
 * Savings goals card — progress bars with target + due date.
 * Shows up to 4 goals. Modeled on the deck design's Goals card.
 */
export function SavingsGoalsCard() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const { goals, isLoading } = useSavingsGoals();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();

  if (isLoading) return null;
  if (!goals || goals.length === 0) return null;

  const visible = goals.slice(0, 4);

  return (
    <div className="ft-card">
      <div className="ft-card-head">
        <div>
          <h3 className="ft-card-title">{t("savings.pageTitle")}</h3>
          <p className="ft-card-sub">
            {goals.length} {t("dashboard.active", { defaultValue: "active" })}
          </p>
        </div>
        <Link
          to="/savings"
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-mute hover:text-foreground hover:bg-bg-hover no-underline hover:no-underline"
          aria-label={t("savings.newGoal", { defaultValue: "New goal" })}
        >
          <Plus className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex flex-col gap-[15px]">
        {visible.map((goal) => {
          const pct = Math.max(
            0,
            Math.min(1, goal.current_amount / goal.target_amount)
          );
          const due = goal.target_date
            ? format(new Date(goal.target_date), "MMM yyyy", { locale: dateLocale })
            : null;
          // The goal's own glyph is its identity in the row. Goals that were
          // saved without a recognised category fall back to the piggy bank
          // rather than to an anonymous colour square.
          const GoalIcon = getCategoryIcon(goal.category) ?? PiggyBank;
          return (
            <div key={goal.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2 font-semibold text-[13px] min-w-0">
                  <GoalIcon
                    className="h-3.5 w-3.5 flex-shrink-0"
                    style={{ color: goal.color }}
                    aria-hidden
                  />
                  <span className="truncate">{goal.name}</span>
                </div>
                <div className="font-mono text-[11.5px] text-fg-dim tabular-nums">
                  {Math.round(pct * 100)}%
                </div>
              </div>
              <div className="ft-progress-track">
                <div
                  className="ft-progress-fill"
                  style={{
                    width: `${pct * 100}%`,
                    background: goal.color,
                  }}
                />
              </div>
              <div className="flex justify-between gap-3 text-[11.5px] text-fg-dim">
                <span className={`font-mono ${isPrivacyMode ? "ft-priv" : ""}`}>
                  {formatCurrency(goal.current_amount)}{" "}
                  {t("dashboard.of", { defaultValue: "of" })}{" "}
                  {formatCurrency(goal.target_amount)}
                </span>
                {due && (
                  <span className="whitespace-nowrap">
                    {t("dashboard.by", { defaultValue: "by" })} {due}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
