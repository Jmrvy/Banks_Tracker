import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { TrendingUp, TrendingDown, ArrowLeftRight, EyeOff } from "lucide-react";

interface ExcludedTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  period: string;
}

export function ExcludedTransactionsModal({
  open,
  onOpenChange,
  transactions,
  period
}: ExcludedTransactionsModalProps) {
  const { formatCurrency } = useUserPreferences();
  const isMobile = useIsMobile();

  const getIcon = (type: string) => {
    switch (type) {
      case 'income':
        return <TrendingUp className="h-4 w-4 text-success" />;
      case 'expense':
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      case 'transfer':
        return <ArrowLeftRight className="h-4 w-4 text-primary" />;
      default:
        return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'income':
        return 'Revenu';
      case 'expense':
        return 'Dépense';
      case 'transfer':
        return 'Transfert';
      default:
        return type;
    }
  };

  // Calculate totals
  const totals = transactions.reduce(
    (acc, t) => {
      if (t.type === 'income') acc.income += t.amount;
      else if (t.type === 'expense') acc.expense += t.amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );

  const netImpact = totals.income - totals.expense;

  const content = (
    <>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-1 sm:gap-2 py-3 border-y border-border">
        <div className="text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Revenus exclus</p>
          <p className="font-semibold text-success text-xs sm:text-sm">+{formatCurrency(totals.income)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Dépenses exclues</p>
          <p className="font-semibold text-destructive text-xs sm:text-sm">-{formatCurrency(totals.expense)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Impact net</p>
          <p className={`font-semibold text-xs sm:text-sm ${netImpact >= 0 ? 'text-success' : 'text-destructive'}`}>
            {netImpact >= 0 ? '+' : ''}{formatCurrency(netImpact)}
          </p>
        </div>
      </div>

      {/* Transaction list */}
      <div className="flex-1 overflow-y-auto space-y-1 sm:space-y-2 py-2">
        {transactions.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-muted-foreground">
            <EyeOff className="h-8 w-8 sm:h-10 sm:w-10 mx-auto mb-2 sm:mb-3 opacity-50" />
            <p className="text-xs sm:text-sm">Aucune transaction exclue sur cette période</p>
            <p className="text-[10px] sm:text-xs mt-1">Toutes les transactions sont incluses dans les statistiques</p>
          </div>
        ) : (
          transactions.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-2 sm:p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            >
              {/* Mobile view */}
              <div className="flex items-center gap-2 min-w-0 flex-1 sm:hidden">
                <div className="flex-shrink-0">{getIcon(t.type)}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate text-xs">{t.description}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(t.transaction_date), 'dd/MM', { locale: fr })}
                    <span className="ml-1">• {getTypeLabel(t.type)}</span>
                  </p>
                </div>
              </div>
              <p className={`font-bold text-xs flex-shrink-0 ml-2 sm:hidden ${
                t.type === 'income' ? 'text-success' : t.type === 'expense' ? 'text-destructive' : 'text-primary'
              }`}>
                {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}{formatCurrency(t.amount)}
              </p>

              {/* Desktop view */}
              <div className="hidden sm:flex items-center gap-3 min-w-0 flex-1">
                <div className="flex-shrink-0">{getIcon(t.type)}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate text-sm">{t.description}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{format(new Date(t.transaction_date), 'dd MMM yyyy', { locale: fr })}</span>
                    <span>•</span>
                    <Badge variant="outline" className="text-xs">
                      {getTypeLabel(t.type)}
                    </Badge>
                    {t.category && (
                      <>
                        <span>•</span>
                        <span>{t.category.name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <p className={`hidden sm:block font-bold text-sm flex-shrink-0 ml-2 ${
                t.type === 'income' ? 'text-success' : t.type === 'expense' ? 'text-destructive' : 'text-primary'
              }`}>
                {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}{formatCurrency(t.amount)}
              </p>
            </div>
          ))
        )}
      </div>

      {transactions.length > 0 && (
        <p className="text-[10px] sm:text-xs text-muted-foreground text-center pt-2 border-t border-border">
          {transactions.length} transaction{transactions.length > 1 ? 's' : ''} exclue{transactions.length > 1 ? 's' : ''} des statistiques
        </p>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh] px-4 pb-6">
          <DrawerHeader className="px-0 pb-2">
            <DrawerTitle className="flex items-center gap-2 text-base">
              <EyeOff className="h-4 w-4 text-muted-foreground" />
              Transactions exclues
            </DrawerTitle>
            <p className="text-xs text-muted-foreground text-left">
              Impactent le solde mais pas les stats ({period})
            </p>
          </DrawerHeader>
          <div className="flex flex-col overflow-hidden">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EyeOff className="h-5 w-5 text-muted-foreground" />
            Transactions exclues des stats
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Ces transactions impactent votre solde "Disponible" mais ne sont pas comptées dans les revenus/dépenses ({period})
          </p>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
