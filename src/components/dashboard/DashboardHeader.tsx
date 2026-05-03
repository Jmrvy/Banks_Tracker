import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Eye,
  EyeOff,
  CalendarIcon,
  Bell,
  Sun,
  Moon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { NewAccountModal } from "@/components/NewAccountModal";
import { NewCategoryModal } from "@/components/NewCategoryModal";
import { NewTransactionModal } from "@/components/NewTransactionModal";
import { useNavigate } from "react-router-dom";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { usePeriod } from "@/contexts/PeriodContext";
import { useTheme } from "@/components/ThemeProvider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
}

export function DashboardHeader({ selectedPeriod, onPeriodChange }: DashboardHeaderProps) {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const navigate = useNavigate();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();
  const { customDateRange, setCustomDateRange } = usePeriod();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const location = useLocation();

  const periods = [
    { label: "1M", value: "1m" },
    { label: "3M", value: "3m" },
    { label: "YTD", value: "ytd" },
    { label: "1Y", value: "1y" },
    { label: t("common.custom", { defaultValue: "Custom" }), value: "custom" },
  ];

  const fixTimezone = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);

  const isDark = theme === "dark";
  const here = (() => {
    if (location.pathname === "/") return t("navigation.home");
    if (location.pathname.startsWith("/accounts")) return t("navigation.accounts");
    if (location.pathname.startsWith("/transactions")) return t("navigation.transactions");
    if (location.pathname.startsWith("/savings")) return t("navigation.savings");
    if (location.pathname.startsWith("/debts")) return t("navigation.debts");
    if (location.pathname.startsWith("/analyse")) return t("navigation.analyse");
    if (location.pathname.startsWith("/recurring")) return t("navigation.recurringTransactions");
    if (location.pathname.startsWith("/installment")) return t("navigation.installmentPayments");
    if (location.pathname.startsWith("/settings")) return t("navigation.settings");
    return t("navigation.home");
  })();

  return (
    <>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-line">
        <div className="flex items-center justify-between gap-4 px-4 md:px-8 py-3 md:py-3.5">
          {/* Crumbs */}
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground min-w-0">
            <span className="hidden md:inline">Workspace</span>
            <span className="hidden md:inline text-fg-dim">/</span>
            <span className="hidden md:inline">Personal</span>
            <span className="hidden md:inline text-fg-dim">/</span>
            <span className="text-foreground font-medium truncate">{here}</span>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2">
            {/* Period segmented */}
            <div className="ft-seg hidden md:inline-flex">
              {periods.map((p) => (
                <button
                  key={p.value}
                  className={selectedPeriod === p.value ? "active" : ""}
                  onClick={() => onPeriodChange(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Mobile period dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="md:hidden h-8 px-2.5 text-xs"
                >
                  {periods.find((p) => p.value === selectedPeriod)?.label || "1M"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                {periods.map((p) => (
                  <DropdownMenuItem
                    key={p.value}
                    onClick={() => onPeriodChange(p.value)}
                  >
                    {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Privacy toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={togglePrivacyMode}
                  className="h-8 w-8"
                >
                  {isPrivacyMode ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isPrivacyMode ? t("common.showAmounts") : t("common.hideAmounts")}
              </TooltipContent>
            </Tooltip>

            {/* Theme toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  className="h-8 w-8"
                >
                  {isDark ? (
                    <Sun className="h-3.5 w-3.5" />
                  ) : (
                    <Moon className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isDark ? "Light" : "Dark"}</TooltipContent>
            </Tooltip>

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="h-8 w-8 hidden md:inline-flex">
              <Bell className="h-3.5 w-3.5" />
            </Button>

            {/* Primary CTA */}
            <Button
              size="sm"
              onClick={() => setShowTransactionModal(true)}
              className="h-8 px-2.5 md:px-3 gap-1.5 font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t("dashboard.newTransaction")}</span>
            </Button>
          </div>
        </div>

        {/* Custom date range picker */}
        {selectedPeriod === "custom" && (
          <div className="flex items-center gap-2 px-4 md:px-8 pb-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span>
                    {t("common.from")}{" "}
                    {format(customDateRange.from, "dd/MM/yy", { locale: fr })}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={customDateRange.from}
                  onSelect={(date) =>
                    date &&
                    setCustomDateRange({
                      ...customDateRange,
                      from: fixTimezone(date),
                    })
                  }
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span>
                    {t("common.until")}{" "}
                    {format(customDateRange.to, "dd/MM/yy", { locale: fr })}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={customDateRange.to}
                  onSelect={(date) =>
                    date &&
                    setCustomDateRange({ ...customDateRange, to: fixTimezone(date) })
                  }
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <NewAccountModal open={showAccountModal} onOpenChange={setShowAccountModal} />
      <NewCategoryModal open={showCategoryModal} onOpenChange={setShowCategoryModal} />
      <NewTransactionModal
        open={showTransactionModal}
        onOpenChange={setShowTransactionModal}
      />
    </>
  );
}
