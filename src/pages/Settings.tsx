import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  BookOpen,
  Database,
  EyeOff,
  LogOut,
  Palette,
  ShieldCheck,
  Smartphone,
  User,
  Wallet,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

const Settings = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { accounts, refetch } = useFinancialData();
  const { preferences, updatePreferences, formatCurrency } = useUserPreferences();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();
  const { isOnline } = useOffline();
  const { queueLength, isProcessing } = useOfflineQueue();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

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
      {
        id: "signout",
        labelKey: "settings.signOutSection",
        labelDefault: "Sign out",
        icon: LogOut,
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
    localStorage.removeItem("budget-app-onboarding-done");
    localStorage.setItem("budget-app-needs-onboarding", "true");
    navigate("/onboarding");
  };

  const handleInstallPwa = () => navigate("/install");

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
      <div className="ft-page">
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
        <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-5 lg:gap-8">
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
                  className={cn(
                    "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "border border-line bg-card text-muted-foreground hover:text-foreground hover:bg-bg-hover"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(s.labelKey, { defaultValue: s.labelDefault })}
                </button>
              );
            })}
          </nav>

          {/* Desktop: sticky left rail */}
          <aside className="hidden lg:block">
            <nav
              aria-label={t("settings.sectionsAria", { defaultValue: "Settings sections" })}
              className="sticky top-6 flex flex-col gap-px"
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
                    className={cn(
                      "flex items-center gap-2 px-3 h-9 rounded-md text-[13px] font-medium text-left transition-colors",
                      active
                        ? "bg-bg-subtle text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-bg-hover"
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", active ? "text-primary" : "")} />
                    <span className="truncate">{t(s.labelKey, { defaultValue: s.labelDefault })}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Scrollable content column */}
          <div ref={containerRef} className="flex flex-col gap-3 sm:gap-4 min-w-0">
            <section id="profile" className="scroll-mt-6">
              <ProfileSection user={user} />
            </section>

            <section id="preferences" className="scroll-mt-6">
              <PreferencesSection
                accounts={accounts}
                preferences={preferences}
                updatePreferences={updatePreferences}
              />
            </section>

            {preferences.enableNotifications && (
              <section id="notifications" className="scroll-mt-6">
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

            {/* New: Privacy & data — consolidates privacy mode, data export,
                and account deletion in one discoverable place. */}
            <section id="privacy" className="scroll-mt-6">
              <div className="ft-card p-5 sm:p-6">
                <div className="ft-card-head">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-primary/12 text-primary grid place-items-center">
                        <ShieldCheck className="h-3.5 w-3.5" />
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
                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Label className="text-sm flex items-center gap-1.5">
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("settings.privacyMode", { defaultValue: "Privacy mode" })}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("settings.privacyModeDesc", {
                          defaultValue: "Blur amounts and balances on screen. Useful in public spaces.",
                        })}
                      </p>
                    </div>
                    <Switch checked={isPrivacyMode} onCheckedChange={togglePrivacyMode} />
                  </div>
                  <div className="border-t border-line" />
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <Label className="text-sm">
                        {t("settings.exportData", { defaultValue: "Export your data" })}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("settings.exportDataDesc", {
                          defaultValue: "Download a CSV of your transactions.",
                        })}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleExportData} className="h-8 text-xs">
                      {t("settings.exportDataAction", { defaultValue: "Open Transactions" })}
                    </Button>
                  </div>
                  <div className="border-t border-line" />
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <Label className="text-sm text-destructive">
                        {t("settings.deleteAccount", { defaultValue: "Delete account" })}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("settings.deleteAccountDesc", {
                          defaultValue: "Permanent removal of your account and all associated data.",
                        })}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteAccount}
                      className="h-8 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      {t("settings.deleteAccountAction", { defaultValue: "Request deletion" })}
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* New: Device & sync — surfaces PWA install + offline status,
                replacing the hidden /install route. */}
            <section id="device" className="scroll-mt-6">
              <div className="ft-card p-5 sm:p-6">
                <div className="ft-card-head">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-primary/12 text-primary grid place-items-center">
                        <Smartphone className="h-3.5 w-3.5" />
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
                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Label className="text-sm flex items-center gap-1.5">
                        <Database className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("settings.syncStatus", { defaultValue: "Sync status" })}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        {isOnline ? (
                          <>
                            <Wifi className="h-3 w-3 text-pos" />
                            {queueLength > 0 || isProcessing
                              ? t("settings.syncQueue", {
                                  count: queueLength,
                                  defaultValue: `Syncing ${queueLength} pending change(s)…`,
                                })
                              : t("settings.syncIdle", {
                                  defaultValue: "Online · all changes saved",
                                })}
                          </>
                        ) : (
                          <>
                            <WifiOff className="h-3 w-3 text-warning" />
                            {t("settings.syncOffline", {
                              count: queueLength,
                              defaultValue: `Offline · ${queueLength} change(s) queued`,
                            })}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-line" />
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <Label className="text-sm">
                        {t("settings.installPwa", { defaultValue: "Install Spending Tracker" })}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("settings.installPwaDesc", {
                          defaultValue: "Add the app to your home screen for full-screen, offline-capable access.",
                        })}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleInstallPwa} className="h-8 text-xs">
                      {t("settings.installPwaAction", { defaultValue: "Install…" })}
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <section id="guide" className="scroll-mt-6">
              <div className="ft-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/12 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{t("settings.guideTitle")}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t("settings.guideSubtitle")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReviewGuide}
                    className="h-8 text-xs flex-shrink-0"
                  >
                    {t("settings.reviewGuide")}
                  </Button>
                </div>
              </div>
            </section>

            <section id="signout" className="scroll-mt-6">
              <div className="ft-card p-4 sm:p-5">
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
