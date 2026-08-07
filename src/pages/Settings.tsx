import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
  ChevronRight,
  EyeOff,
  LogOut,
  Palette,
  PiggyBank,
  Plus,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  User,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { useOffline } from "@/hooks/useOffline";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { PreferencesSection } from "@/components/settings/PreferencesSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { AccountsSection } from "@/components/settings/AccountsSection";
import { TraceSection } from "@/components/settings/TraceSection";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { cn } from "@/lib/utils";

interface SectionDef {
  id: string;
  /** i18n key for the rail label. */
  labelKey: string;
  labelDefault: string;
  icon: typeof User;
  /** Hidden when the user has notifications globally disabled, etc. */
  hidden?: boolean;
}

/** The guide's topic tiles. Labels reuse the navigation strings. */
const GUIDE_TOPICS: { id: string; labelKey: string; labelDefault: string; icon: typeof User }[] = [
  { id: "home", labelKey: "navigation.home", labelDefault: "Dashboard", icon: BarChart3 },
  { id: "budget", labelKey: "navigation.budget", labelDefault: "Budget", icon: Target },
  { id: "scheduled", labelKey: "navigation.scheduled", labelDefault: "Scheduled", icon: CalendarClock },
  { id: "trace", labelKey: "navigation.trace", labelDefault: "Trace", icon: Sparkles },
  { id: "savings", labelKey: "navigation.savings", labelDefault: "Savings", icon: PiggyBank },
  { id: "reports", labelKey: "navigation.reports", labelDefault: "Reports", icon: BookOpen },
];

const Settings = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { accounts, categories, refetch } = useFinancialData();
  const { preferences, updatePreferences, formatCurrency } = useUserPreferences();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();
  const { isOnline } = useOffline();
  const { queueLength, isProcessing } = useOfflineQueue();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true
    );
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const installed = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const sections: SectionDef[] = useMemo(
    () => [
      {
        id: "profile",
        labelKey: "settings.profile",
        labelDefault: "Profile",
        icon: User,
      },
      {
        id: "preferences",
        labelKey: "settings.preferences",
        labelDefault: "Preferences",
        icon: Palette,
      },
      {
        id: "notifications",
        labelKey: "settings.notifications",
        labelDefault: "Notifications",
        icon: Bell,
        hidden: !preferences.enableNotifications,
      },
      {
        id: "accounts",
        labelKey: "settings.myAccounts",
        labelDefault: "My accounts",
        icon: Wallet,
      },
      {
        id: "categories",
        labelKey: "settings.myCategories",
        labelDefault: "My categories",
        icon: Target,
      },
      {
        id: "trace",
        labelKey: "settings.traceSection",
        labelDefault: "Trace copilot",
        icon: Sparkles,
      },
      {
        id: "privacy",
        labelKey: "settings.privacySection",
        labelDefault: "Privacy & data",
        icon: ShieldCheck,
      },
      {
        id: "device",
        labelKey: "settings.deviceSection",
        labelDefault: "Device & sync",
        icon: Smartphone,
      },
      {
        id: "guide",
        labelKey: "settings.guideTitle",
        labelDefault: "Application guide",
        icon: BookOpen,
      },
    ],
    [preferences.enableNotifications]
  );
  const visibleSections = sections.filter((s) => !s.hidden);

  const [activeSection, setActiveSection] = useState<string>(visibleSections[0]?.id ?? "profile");

  // Sync the rail highlight with the current scroll position so the rail
  // doubles as a navigator while the user scrolls.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        rootMargin: "-30% 0px -55% 0px",
        threshold: [0.1, 0.3, 0.6],
      }
    );
    visibleSections.forEach((s) => {
      const el = container.querySelector(`#${s.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [visibleSections]);

  const handleScrollTo = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleReviewGuide = () => {
    // Restart the in-app tour instead of routing back to the old onboarding wizard.
    try {
      // Dynamic import to avoid hard-coupling Settings to tour context provider order.
      const ev = new CustomEvent("tour:restart");
      window.dispatchEvent(ev);
    } catch {
      /* ignore */
    }
    navigate("/");
  };

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") setIsStandalone(true);
      } catch {
        /* user dismissed */
      } finally {
        setDeferredPrompt(null);
      }
      return;
    }
    if (isIOS) {
      setShowIosHelp((v) => !v);
      return;
    }
    navigate("/install");
  };

  const handleExportData = () => {
    // CSV export of all user data — currently scoped to transactions through
    // the existing Transactions page action. Surfacing the entry point here
    // gives users a single discoverable Privacy → Export path.
    navigate("/transactions");
  };

  const handleDeleteAccount = () => {
    // Account deletion is destructive and currently routes through the
    // support flow. The button surfaces the action in Settings; the flow
    // itself is unchanged for this iteration.
    window.location.href = "mailto:support@spendingtracker.app?subject=Delete%20account";
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      {/* Settings is a form page: the design narrows it well inside the
          dashboard measure so rows don't stretch away from their hints. */}
      <div className="ft-page max-w-[1080px]">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t("navigation.settings")}</div>
            <h1 className="ft-page-title">{t("settings.title")}</h1>
            <div className="ft-page-sub">{t("navigation.manageProfile")}</div>
          </div>
        </div>

        {/* Two-column layout: left rail (sticky on desktop) + scrollable
            sections. On mobile the rail collapses to a horizontal scrolling
            strip pinned to the top of the page, doubling as a tab strip. */}
        <div className="grid grid-cols-1 lg:grid-cols-[216px_minmax(0,1fr)] gap-5 lg:gap-[26px] items-start">
          {/* Mobile: horizontal scroll strip */}
          <nav
            aria-label={t("settings.sectionsAria", { defaultValue: "Settings sections" })}
            className="lg:hidden flex gap-1 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-thin"
          >
            {visibleSections.map((s) => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleScrollTo(s.id)}
                  className={cn("ft-chip flex-shrink-0", active && "active")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(s.labelKey, { defaultValue: s.labelDefault })}
                </button>
              );
            })}
          </nav>

          {/* Desktop: sticky left rail */}
          <aside className="hidden lg:block sticky top-6 self-start">
            <nav
              aria-label={t("settings.sectionsAria", { defaultValue: "Settings sections" })}
              className="flex flex-col gap-px"
            >
              {visibleSections.map((s) => {
                const Icon = s.icon;
                const active = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleScrollTo(s.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn("ft-nav-item", active && "active")}
                  >
                    <Icon className="ft-nav-icon" />
                    <span className="truncate">{t(s.labelKey, { defaultValue: s.labelDefault })}</span>
                  </button>
                );
              })}
            </nav>
            {/* The only destructive affordance in the rail — separated and
                tinted `--neg`, and it signs out rather than scrolling. */}
            <button
              type="button"
              onClick={signOut}
              className="ft-nav-item mt-2 text-neg hover:text-neg"
            >
              <LogOut className="ft-nav-icon text-neg" />
              <span className="truncate">{t("auth.signOut")}</span>
            </button>
          </aside>

          {/* Scrollable content column */}
          <div ref={containerRef} className="flex flex-col gap-[18px] min-w-0">
            <section id="profile" className="scroll-mt-6">
              <ProfileSection user={user} />
            </section>

            <section id="preferences" data-tour="set-prefs" className="scroll-mt-6">
              <PreferencesSection
                accounts={accounts}
                preferences={preferences}
                updatePreferences={updatePreferences}
              />
            </section>

            {preferences.enableNotifications && (
              <section id="notifications" data-tour="set-notif" className="scroll-mt-6">
                <NotificationsSection user={user} />
              </section>
            )}

            <section id="accounts" className="scroll-mt-6">
              <AccountsSection
                accounts={accounts}
                refetch={refetch}
                formatCurrency={formatCurrency}
              />
            </section>

            {/* Accounts are paired with categories in the design — every
                category as a colour-dotted chip, plus an add affordance.
                Creation lives on Transactions, so the chip links there
                rather than introducing new mutation logic here. */}
            <section id="categories" className="scroll-mt-6">
              <div className="ft-card">
                <div className="ft-card-head">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="ft-kpi-icon acc">
                        <Wallet className="h-[15px] w-[15px]" />
                      </div>
                      <h3 className="ft-card-title text-base">
                        {t("settings.myCategories", { defaultValue: "My categories" })}
                      </h3>
                    </div>
                    <p className="ft-card-sub mt-1">
                      {t("settings.manageCategories", { defaultValue: "Manage your categories" })}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <span key={category.id} className="ft-chip">
                      <i className="dot" style={{ background: category.color }} aria-hidden />
                      {category.name}
                    </span>
                  ))}
                  <button type="button" className="ft-chip" onClick={() => navigate("/transactions")}>
                    <Plus className="h-3 w-3" />
                    {t("common.newCategory", { defaultValue: "New category" })}
                  </button>
                </div>
              </div>
            </section>

            {/* Trace copilot — the key that pays for it, the model it runs
                on, and what it may do, together rather than split across
                sections. */}
            <section id="trace" className="scroll-mt-6">
              <TraceSection />
            </section>

            {/* New: Privacy & data — consolidates privacy mode, data export,
                and account deletion in one discoverable place. */}
            <section id="privacy" data-tour="set-privacy" className="scroll-mt-6">
              <div className="ft-card">
                <div className="ft-card-head">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="ft-kpi-icon acc">
                        <ShieldCheck className="h-[15px] w-[15px]" />
                      </div>
                      <h3 className="ft-card-title text-base">
                        {t("settings.privacySection", { defaultValue: "Privacy & data" })}
                      </h3>
                    </div>
                    <p className="ft-card-sub mt-1">
                      {t("settings.privacySubtitle", {
                        defaultValue: "Control what's visible on screen and how your data leaves the app.",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <SettingsRow
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("settings.privacyMode", { defaultValue: "Privacy mode" })}
                      </span>
                    }
                    hint={t("settings.privacyModeDesc", {
                      defaultValue: "Blur amounts and balances on screen. Useful in public spaces.",
                    })}
                  >
                    <Switch checked={isPrivacyMode} onCheckedChange={togglePrivacyMode} />
                  </SettingsRow>
                  <SettingsRow
                    label={t("settings.exportData", { defaultValue: "Export your data" })}
                    hint={t("settings.exportDataDesc", {
                      defaultValue: "Download a CSV of your transactions.",
                    })}
                  >
                    <Button variant="outline" size="sm" onClick={handleExportData} className="h-8 text-xs">
                      {t("settings.exportDataAction", { defaultValue: "Open Transactions" })}
                    </Button>
                  </SettingsRow>
                  <SettingsRow
                    label={
                      <span className="text-destructive">
                        {t("settings.deleteAccount", { defaultValue: "Delete account" })}
                      </span>
                    }
                    hint={t("settings.deleteAccountDesc", {
                      defaultValue: "Permanent removal of your account and all associated data.",
                    })}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteAccount}
                      className="h-8 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      {t("settings.deleteAccountAction", { defaultValue: "Request deletion" })}
                    </Button>
                  </SettingsRow>
                </div>
              </div>
            </section>

            {/* New: Device & sync — surfaces PWA install + offline status,
                replacing the hidden /install route. */}
            <section id="device" className="scroll-mt-6">
              <div className="ft-card">
                <div className="ft-card-head">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="ft-kpi-icon acc">
                        <Smartphone className="h-[15px] w-[15px]" />
                      </div>
                      <h3 className="ft-card-title text-base">
                        {t("settings.deviceSection", { defaultValue: "Device & sync" })}
                      </h3>
                    </div>
                    <p className="ft-card-sub mt-1">
                      {t("settings.deviceSubtitle", {
                        defaultValue: "Install on this device and review your sync state.",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {/* Sync is a status, not a setting: the design gives it a
                      sunk strip with the pulsing live dot above the rows. */}
                  <div
                    role="status"
                    className="flex items-center gap-3 rounded-[15px] border border-line-soft bg-bg-subtle p-[15px] mb-2"
                  >
                    <span
                      className={cn(
                        "ft-live",
                        !isOnline && "bg-warn shadow-[0_0_0_3.5px_hsl(var(--warn-soft))]",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold">
                        {isOnline
                          ? t("common.online", { defaultValue: "Online" })
                          : t("common.offline", { defaultValue: "Offline" })}
                      </div>
                      <div className="text-xs text-muted-foreground mt-px">
                        {isOnline
                          ? queueLength > 0 || isProcessing
                            ? t("settings.syncQueue", {
                                count: queueLength,
                                defaultValue: `Syncing ${queueLength} pending change(s)…`,
                              })
                            : t("settings.syncIdle", {
                                defaultValue: "Online · all changes saved",
                              })
                          : t("settings.syncOffline", {
                              count: queueLength,
                              defaultValue: `Offline · ${queueLength} change(s) queued`,
                            })}
                      </div>
                    </div>
                  </div>
                  <SettingsRow
                    label={
                      isStandalone
                        ? t("settings.installPwaDone", { defaultValue: "Banks Tracker installed" })
                        : t("settings.installPwa", { defaultValue: "Install Banks Tracker" })
                    }
                    hint={
                      <>
                        {isStandalone
                          ? t("settings.installPwaDoneDesc", {
                              defaultValue: "The app is already installed on this device.",
                            })
                          : isIOS
                          ? t("settings.installPwaIosDesc", {
                              defaultValue: "On iPhone: Share → Add to Home Screen.",
                            })
                          : deferredPrompt
                          ? t("settings.installPwaDesc", {
                              defaultValue: "Add the app to your home screen for full-screen, offline use.",
                            })
                          : t("settings.installPwaUnavailable", {
                              defaultValue: "Installation isn't available in this browser. Use Chrome, Edge, or Safari on mobile.",
                            })}
                        {showIosHelp && isIOS && (
                          <ol className="mt-2 list-decimal pl-4 space-y-1">
                            <li>{t("settings.installPwaIos1", { defaultValue: "Open this page in Safari" })}</li>
                            <li>{t("settings.installPwaIos2", { defaultValue: "Tap the Share icon" })}</li>
                            <li>{t("settings.installPwaIos3", { defaultValue: "Choose “Add to Home Screen”" })}</li>
                            <li>{t("settings.installPwaIos4", { defaultValue: "Tap “Add”" })}</li>
                          </ol>
                        )}
                      </>
                    }
                  >
                    {!isStandalone && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleInstallPwa}
                        disabled={!deferredPrompt && !isIOS}
                        className="h-8 text-xs"
                      >
                        {isIOS
                          ? t("settings.installPwaActionIos", { defaultValue: "How to install" })
                          : t("settings.installPwaAction", { defaultValue: "Install" })}
                      </Button>
                    )}
                  </SettingsRow>
                </div>
              </div>
            </section>

            <section id="guide" className="scroll-mt-6">
              <div className="ft-card">
                <div className="ft-card-head">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="ft-kpi-icon acc">
                        <BookOpen className="h-[15px] w-[15px]" />
                      </div>
                      <h3 className="ft-card-title text-base">{t("settings.guideTitle")}</h3>
                    </div>
                    <p className="ft-card-sub mt-1">{t("settings.guideSubtitle")}</p>
                  </div>
                </div>
                {/* A browsable menu of topics rather than one strip. Every
                    tile restarts the same tour — there is no per-topic tour
                    yet, so nothing changes behaviourally. */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {GUIDE_TOPICS.map(({ id, labelKey, labelDefault, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={handleReviewGuide}
                      className="flex items-center gap-[11px] text-left rounded-[15px] border border-line-soft bg-bg-subtle p-3.5 hover:bg-bg-hover transition-colors"
                    >
                      <div className="ft-kpi-icon acc">
                        <Icon className="h-[15px] w-[15px]" />
                      </div>
                      <span className="text-[13px] font-semibold truncate">
                        {t(labelKey, { defaultValue: labelDefault })}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-fg-dim ml-auto flex-shrink-0" />
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReviewGuide}
                  className="h-8 text-xs mt-4"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  {t("settings.reviewGuide")}
                </Button>
              </div>
            </section>

            <section id="signout" className="scroll-mt-6">
              <div className="ft-card">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="ft-card-title">
                      {t("settings.signOutSection", { defaultValue: "Sign out" })}
                    </h3>
                    <p className="ft-card-sub mt-0.5">
                      {t("settings.signOutSectionDesc", { defaultValue: "Sign out of your account" })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={signOut}
                    size="sm"
                    className="h-8 text-sm border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    {t("auth.signOut")}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
