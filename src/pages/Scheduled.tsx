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

        {/* Tab strip */}
        <div className="ft-card-flush">
          <div
            role="tablist"
            aria-label={t("scheduled.tabs", { defaultValue: "Scheduled tools" })}
            className="flex items-stretch gap-1 px-2 py-2 border-b border-line overflow-x-auto"
          >
            {TABS.map(({ key, Icon, labelKey, labelDefault }) => {
              const isActive = active === key;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    "inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                    isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-bg-hover"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(labelKey, { defaultValue: labelDefault })}
                </button>
              );
            })}
          </div>

          {/* Active tab body — embedded, with a small inset so it sits inside
              the card surround. Each child is responsible for its own
              loading/empty/error states. */}
          <div className="px-4 sm:px-5 md:px-6 py-4 md:py-5">
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
      </div>
    </div>
  );
};

export default Scheduled;

/** Map an old standalone path to the right `/scheduled?tab=…` query. */
export function legacyPathToScheduledTab(path: string): TabKey {
  return TABS.find((tab) => path.startsWith(tab.legacyPath))?.key ?? "subscriptions";
}
