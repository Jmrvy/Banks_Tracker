import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportsStats } from "@/hooks/useReportsData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface StatsCardsProps {
  stats: ReportsStats;
  accountsCount: number;
  onIncomeClick?: () => void;
  onExpensesClick?: () => void;
}

const Tile = ({
  icon: Icon,
  iconClass,
  label,
  value,
  valueClass,
  onClick,
}: {
  icon: typeof TrendingUp;
  iconClass: "pos" | "neg" | "acc" | "warn" | "";
  label: string;
  value: string | number;
  valueClass?: string;
  onClick?: () => void;
}) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("ft-kpi p-2.5 sm:p-3 lg:p-4 gap-1.5 text-left", onClick && "cursor-pointer")}
    >
      <div className="flex items-center gap-1.5 lg:gap-2">
        <div className={cn("ft-kpi-icon h-7 w-7 lg:h-8 lg:w-8", iconClass)}>
          <Icon className="h-3 w-3 lg:h-4 lg:w-4" />
        </div>
        <span className="ft-kpi-label text-[10px] lg:text-xs truncate hidden sm:block">{label}</span>
      </div>
      <div className={cn("ft-kpi-value text-sm lg:text-xl truncate leading-tight", valueClass)}>
        {value}
      </div>
    </Tag>
  );
};

export const StatsCards = ({ stats, accountsCount, onIncomeClick, onExpensesClick }: StatsCardsProps) => {
  const { formatCurrency } = useUserPreferences();

  return (
    <div className="grid grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
      <Tile
        icon={TrendingUp}
        iconClass="pos"
        label="Revenus"
        value={formatCurrency(stats.income)}
        valueClass="text-pos"
        onClick={onIncomeClick}
      />
      <Tile
        icon={TrendingDown}
        iconClass="neg"
        label="Dépenses"
        value={formatCurrency(stats.expenses)}
        valueClass="text-destructive"
        onClick={onExpensesClick}
      />
      <Tile
        icon={Wallet}
        iconClass="acc"
        label="Initial"
        value={formatCurrency(stats.initialBalance)}
      />
      <Tile
        icon={Target}
        iconClass="warn"
        label="Final"
        value={formatCurrency(stats.finalBalance)}
        valueClass={stats.finalBalance >= 0 ? "text-pos" : "text-destructive"}
      />
      <div className="hidden lg:block">
        <Tile
          icon={Wallet}
          iconClass=""
          label="Comptes"
          value={accountsCount}
        />
      </div>
    </div>
  );
};
