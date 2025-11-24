import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, Settings, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewAccountModal } from "@/components/NewAccountModal";
import { NewCategoryModal } from "@/components/NewCategoryModal";
import { ReportGeneratorModal } from "@/components/ReportGeneratorModal";
import { useNavigate } from "react-router-dom";

interface DashboardHeaderProps {
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
}

export function DashboardHeader({ selectedPeriod, onPeriodChange }: DashboardHeaderProps) {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const navigate = useNavigate();

  const periods = [
    { label: "1M", value: "1m" },
    { label: "3M", value: "3m" },
    { label: "1Y", value: "1y" },
    { label: "Custom", value: "custom" },
  ];

  return (
    <>
      <div className="flex items-center justify-between py-4 px-6 border-b border-border">
        {/* Left: Period selector and date range */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Calendar className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-1">
            {periods.map((period) => (
              <Button
                key={period.value}
                variant={selectedPeriod === period.value ? "default" : "ghost"}
                size="sm"
                onClick={() => onPeriodChange(period.value)}
                className={`h-8 px-3 text-sm ${
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

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => navigate("/new-transaction")}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Transaction
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
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
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      <NewAccountModal open={showAccountModal} onOpenChange={setShowAccountModal} />
      <NewCategoryModal open={showCategoryModal} onOpenChange={setShowCategoryModal} />
      <ReportGeneratorModal open={showReportModal} onOpenChange={setShowReportModal} />
    </>
  );
}
