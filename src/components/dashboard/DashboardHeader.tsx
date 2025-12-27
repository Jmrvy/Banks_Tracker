import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, Settings, Plus, FileText, Eye, EyeOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewAccountModal } from "@/components/NewAccountModal";
import { NewCategoryModal } from "@/components/NewCategoryModal";
import { NewTransactionModal } from "@/components/NewTransactionModal";
import { ReportGeneratorModal } from "@/components/ReportGeneratorModal";
import { useNavigate } from "react-router-dom";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DashboardHeaderProps {
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
}

export function DashboardHeader({ selectedPeriod, onPeriodChange }: DashboardHeaderProps) {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const navigate = useNavigate();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

  const periods = [
    { label: "1M", value: "1m" },
    { label: "3M", value: "3m" },
    { label: "1Y", value: "1y" },
    { label: "Custom", value: "custom" },
  ];

  return (
    <>
      <div className="flex items-center justify-between py-3 px-4 md:py-4 md:px-6 border-b border-border">
        {/* Left: Period selector */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="hidden md:flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Calendar className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1 md:gap-2 bg-muted/30 rounded-lg p-0.5 md:p-1">
            {periods.map((period) => (
              <Button
                key={period.value}
                variant={selectedPeriod === period.value ? "default" : "ghost"}
                size="sm"
                onClick={() => onPeriodChange(period.value)}
                className={`h-7 md:h-8 px-2 md:px-3 text-xs md:text-sm ${
                  selectedPeriod === period.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {period.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Right: Actions - simplified for mobile */}
        <div className="flex items-center gap-1 md:gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePrivacyMode}
                className="text-muted-foreground hover:text-foreground h-8 px-2"
              >
                {isPrivacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isPrivacyMode ? "Afficher les montants" : "Masquer les montants"}
            </TooltipContent>
          </Tooltip>

          <Button
            variant="default"
            size="sm"
            onClick={() => setShowTransactionModal(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-2 md:px-4"
          >
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Nouvelle Transaction</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReportModal(true)}
            className="border-border hover:bg-accent h-8 px-2 md:px-4 hidden sm:flex"
          >
            <FileText className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Générer Rapport</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 px-2 md:px-4 hidden lg:flex">
                <Plus className="h-4 w-4 mr-2" />
                Create
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover border-border z-50">
              <DropdownMenuItem onClick={() => setShowAccountModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowCategoryModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Category
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/settings")}
            className="text-muted-foreground hover:text-foreground h-8 px-2 md:px-4 hidden lg:flex"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      <NewAccountModal open={showAccountModal} onOpenChange={setShowAccountModal} />
      <NewCategoryModal open={showCategoryModal} onOpenChange={setShowCategoryModal} />
      <NewTransactionModal open={showTransactionModal} onOpenChange={setShowTransactionModal} />
      <ReportGeneratorModal open={showReportModal} onOpenChange={setShowReportModal} />
    </>
  );
}
