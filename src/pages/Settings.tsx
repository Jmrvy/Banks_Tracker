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
  Sparkles,
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
import { TraceSection } from "@/components/settings/TraceSection";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface SectionDef {
  id: string;
  /** i18n key for the rail label. */
  labelKey: string;
  labelDefault: string;
  icon: typeof User;
  /** Hidden when the user has notifications globally disabled, etc. */
  hidden?: boolean;
  /** `data-tour` anchor for the rail entry. The tour points at the rail
   *  rather than the panel, because only the open panel is in the DOM. */
  tourAnchor?: string;
}

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
  const isMobile = useIsMobile();
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
        tourAnchor: "set-prefs",
      },
      {
        id: "notifications",
        labelKey: "settings.notifications",
        labelDefault: "Notifications",
        icon: Bell,
        tourAnchor: "set-notif",
        hidden: !preferences.enableNotifications,
      },
      {
        id: "accounts",
        labelKey: "settings.myAccounts",
        labelDefault: "My accounts",
        icon: Wallet,
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
        tourAnchor: "set-privacy",
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

  // Opening a section from the rail scrolls back to the top of the panel —
  // on a phone the rail sits above the content, so without this a tap can
  // leave the user looking at the middle of the new section.
  const openSection = (id: string) => {
    setActiveSection(id);
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
                  onClick={() => openSection(s.id)}
                  data-tour={isMobile ? s.tourAnchor : undefined}
                  aria-current={active ? "true" : undefined}
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
                    onClick={() => openSection(s.id)}
                    data-tour={isMobile ? undefined : s.tourAnchor}
                    aria-current={active ? "true" : undefined}
                    className={cn("ft-nav-item", active && "active")}
                  >
                    <Icon className="ft-nav-icon" />
                    <span className="truncate">{t(s.labelKey, { defaultValue: s.labelDefault })}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Panel column — the deck shows one section at a time, with the
              rail switching between them rather than scrolling one long page.
              Every section is still here, one click away. */}
          <div ref={containerRef} className="flex flex-col gap-3 sm:gap-4 min-w-0 scroll-mt-6">
            {activeSection === "profile" && (
            <section id="profile">
              <ProfileSection user={user} />
            </section>
            )}

            {activeSection === "preferences" && (
            <section id="preferences">
              <PreferencesSection
                accounts={accounts}
                preferences={preferences}
                updatePreferences={updatePreferences}
              />
            </section>
            )}

            {activeSection === "notifications" && preferences.enableNotifications && (
              <section id="notifications">
                <NotificationsSection user={user} />
              </section>
            )}

            {activeSection === "accounts" && (
            <section id="accounts">
              <AccountsSection
                accounts={accounts}
                refetch={refetch}
                formatCurrency={formatCurrency}
              />
            </section>
            )}

            {/* Trace copilot — the key that pays for it, the model it runs
                on, and what it may do, together rather than split across
                sections. */}
            {activeSection === "trace" && (
            <section id="trace">
              <TraceSection />
            </section>
            )}

            {/* New: Privacy & data — consolidates privacy mode, data export,
                and account deletion in one discoverable place. */}
            {activeSection === "privacy" && (
            <section id="privacy">
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
            )}

            {/* New: Device & sync — surfaces PWA install + offline status,
                replacing the hidden /install route. */}
            {activeSection === "device" && (
            <section id="device">
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
                        {isStandalone
                          ? t("settings.installPwaDone", { defaultValue: "JMRVY CB installée" })
                          : t("settings.installPwa", { defaultValue: "Installer JMRVY CB" })}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isStandalone
                          ? t("settings.installPwaDoneDesc", {
                              defaultValue: "L'app est déjà installée sur cet appareil.",
                            })
                          : isIOS
                          ? t("settings.installPwaIosDesc", {
                              defaultValue: "Sur iPhone : Partager → Sur l'écran d'accueil.",
                            })
                          : deferredPrompt
                          ? t("settings.installPwaDesc", {
                              defaultValue: "Ajoutez l'app à votre écran d'accueil pour un usage plein écran et hors ligne.",
                            })
                          : t("settings.installPwaUnavailable", {
                              defaultValue: "Installation indisponible dans ce navigateur. Utilisez Chrome, Edge ou Safari sur mobile.",
                            })}
                      </p>
                      {showIosHelp && isIOS && (
                        <ol className="mt-2 text-xs text-muted-foreground list-decimal pl-4 space-y-1">
                          <li>Ouvrez cette page dans Safari</li>
                          <li>Touchez l'icône Partager</li>
                          <li>Choisissez "Sur l'écran d'accueil"</li>
                          <li>Touchez "Ajouter"</li>
                        </ol>
                      )}
                    </div>
                    {!isStandalone && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleInstallPwa}
                        disabled={!deferredPrompt && !isIOS}
                        className="h-8 text-xs"
                      >
                        {isIOS
                          ? t("settings.installPwaActionIos", { defaultValue: "Comment installer" })
                          : t("settings.installPwaAction", { defaultValue: "Installer" })}
                      </Button>
                    )}
                  </div>

                </div>
              </div>
            </section>
            )}

            {activeSection === "guide" && (
            <section id="guide">
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
            )}

            {activeSection === "signout" && (
            <section id="signout">
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
