import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarClock, CreditCard, Receipt, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/LoadingSpinner";

// The three pages render embedded (no outer chrome). Lazy-loaded so the
// unified page only pays for the bundle of the active tab.
const RecurringTransactions = lazy(() => import("@/pages/RecurringTransactions"));
const InstallmentPayments = lazy(() => import("@/pages/InstallmentPayments"));
const Debts = lazy(() => import("@/pages/Debts"));

type TabKey = "subscriptions" | "plans" | "loans";

interface TabDef {
  key: TabKey;
  /** Icon shown in the tab strip. */
  Icon: typeof Receipt;
  /** i18n key + default label. */
  labelKey: string;
  labelDefault: string;
  /** Old standalone path that maps onto this tab — used for redirects. */
  legacyPath: string;
}

const TABS: TabDef[] = [
  {
    key: "subscriptions",
    Icon: Receipt,
    labelKey: "scheduled.subscriptions",
    labelDefault: "Subscriptions",
    legacyPath: "/recurring-transactions",
  },
  {
    key: "plans",
    Icon: CreditCard,
    labelKey: "scheduled.plans",
    labelDefault: "Plans",
    legacyPath: "/installment-payments",
  },
  {
    key: "loans",
    Icon: Scale,
    labelKey: "scheduled.loans",
    labelDefault: "Loans",
    legacyPath: "/debts",
  },
];

function tabFromSearch(search: string): TabKey {
  const params = new URLSearchParams(search);
  const t = params.get("tab");
  if (t === "subscriptions" || t === "plans" || t === "loans") return t;
  return "subscriptions";
}

const Scheduled = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [active, setActive] = useState<TabKey>(() => tabFromSearch(location.search));

  // Keep state in sync with `?tab=` so deep links from notifications / emails
  // land on the right tab and back/forward navigation works as expected.
  useEffect(() => {
    setActive(tabFromSearch(location.search));
  }, [location.search]);

  const setTab = (next: TabKey) => {
    const params = new URLSearchParams(location.search);
    params.set("tab", next);
    navigate({ pathname: "/scheduled", search: `?${params.toString()}` }, { replace: false });
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head — single shared header for all three tools. */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t("navigation.tools")}</div>
            <h1 className="ft-page-title">
              {t("scheduled.pageTitle", { defaultValue: "Scheduled" })}
            </h1>
            <div className="ft-page-sub">
              {t("scheduled.subtitle", {
                defaultValue: "Money on a schedule — subscriptions, plans, and loans in one place.",
              })}
            </div>
          </div>
        </div>

        {/* The three tools are peer views of scheduled money, so they get the
            design system's segmented control rather than a bespoke tab strip.
            Each keeps its own `data-tour` anchor. */}
        <div
          role="tablist"
          aria-label={t("scheduled.tabs", { defaultValue: "Scheduled tools" })}
          className="max-w-full overflow-x-auto [scrollbar-width:none]"
        >
          <div className="ft-seg">
            {TABS.map(({ key, Icon, labelKey, labelDefault }) => {
              const isActive = active === key;
              const tourAnchor =
                key === "subscriptions" ? "sched-cal" : key === "plans" ? "sched-plans" : "sched-loans";
              return (
                <button
                  key={key}
                  data-tour={tourAnchor}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn("inline-flex items-center gap-1.5", isActive && "active")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(labelKey, { defaultValue: labelDefault })}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active tab body. Each child owns its loading / empty / error
            states, and its own period summary — this page deliberately does
            not restate those totals above the panel that computes them. */}
        <Suspense
          fallback={
            <div className="py-12">
              <LoadingSpinner text={t("common.loading")} />
            </div>
          }
        >
          {active === "subscriptions" && <RecurringTransactions embedded />}
          {active === "plans" && <InstallmentPayments embedded />}
          {active === "loans" && <Debts embedded />}
        </Suspense>
      </div>
    </div>
  );
};

export default Scheduled;

/** Map an old standalone path to the right `/scheduled?tab=…` query. */
export function legacyPathToScheduledTab(path: string): TabKey {
  return TABS.find((tab) => path.startsWith(tab.legacyPath))?.key ?? "subscriptions";
}
