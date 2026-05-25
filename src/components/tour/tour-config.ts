// Single source of truth for the onboarding tour.
//
// Each step references a `data-tour="<id>"` anchor that lives on a real
// component in the app. Tip copy is i18n-keyed: `tour.tips.<id>.{title,body}`.

export type TourGoal = "track" | "save" | "debt";

export interface TourStep {
  id: string;
  /** CSS selector resolved against the live DOM. */
  selector: string;
  /** Route to navigate to before showing the step (for checklist items). */
  route?: string;
  /** Optional query string appended to the route (e.g. `?tab=loans`). */
  search?: string;
  /** Logical grouping for the checklist rail. */
  group: "essentials" | "money" | "plan" | "insight" | "polish";
  /** Tooltip placement preference. Auto-flips if there isn't room. */
  placement?: "top" | "bottom" | "left" | "right";
}

export const TOUR_VERSION = 2;
export const TOUR_STORAGE_KEY = "budget-app-tour-progress";
export const TOUR_VERSION_KEY = "budget-app-tour-version";

// Order matters for the essentials sequence (first 5 entries).
export const ESSENTIAL_STEPS: TourStep[] = [
  { id: "hero", selector: '[data-tour="hero"]', group: "essentials", route: "/", placement: "bottom" },
  { id: "kpis", selector: '[data-tour="kpis"]', group: "essentials", route: "/", placement: "bottom" },
  { id: "palette", selector: '[data-tour="search"]', group: "essentials", route: "/", placement: "right" },
  { id: "new-tx", selector: '[data-tour="new-tx"]', group: "essentials", route: "/", placement: "bottom" },
  { id: "nav", selector: '[data-tour="nav"]', group: "essentials", route: "/", placement: "right" },
];

export const CHECKLIST_STEPS: TourStep[] = [
  { id: "accounts", selector: '[data-tour="accounts-add"]', group: "money", route: "/accounts", placement: "bottom" },
  { id: "transactions", selector: '[data-tour="tx-filters"]', group: "money", route: "/transactions", placement: "bottom" },
  { id: "budget", selector: '[data-tour="budget-row"]', group: "money", route: "/budget", placement: "bottom" },
  { id: "savings", selector: '[data-tour="goal-card"]', group: "plan", route: "/savings", placement: "bottom" },
  { id: "debts", selector: '[data-tour="sched-loans"]', group: "plan", route: "/scheduled", search: "?tab=loans", placement: "bottom" },
  { id: "installments", selector: '[data-tour="sched-plans"]', group: "plan", route: "/scheduled", search: "?tab=plans", placement: "bottom" },
  { id: "recurring", selector: '[data-tour="sched-cal"]', group: "plan", route: "/scheduled", search: "?tab=subscriptions", placement: "bottom" },
  { id: "reports", selector: '[data-tour="reports-tabs"]', group: "insight", route: "/analyse", placement: "bottom" },
  { id: "notifications", selector: '[data-tour="set-notif"]', group: "polish", route: "/settings", placement: "top" },
  { id: "privacy", selector: '[data-tour="set-privacy"]', group: "polish", route: "/settings", placement: "top" },
  { id: "settings", selector: '[data-tour="set-prefs"]', group: "polish", route: "/settings", placement: "top" },
];

export const ALL_STEPS: TourStep[] = [...ESSENTIAL_STEPS, ...CHECKLIST_STEPS];
export const TOTAL_STEPS = ALL_STEPS.length;

/** Reorder the checklist based on the user's stated goal. */
export function orderChecklist(steps: TourStep[], goal: TourGoal | null): TourStep[] {
  if (!goal) return steps;
  const priorities: Record<TourGoal, string[]> = {
    debt: ["debts", "installments", "budget"],
    save: ["savings", "budget", "accounts"],
    track: [],
  };
  const top = priorities[goal];
  if (!top.length) return steps;
  return [
    ...top.map((id) => steps.find((s) => s.id === id)).filter(Boolean) as TourStep[],
    ...steps.filter((s) => !top.includes(s.id)),
  ];
}
