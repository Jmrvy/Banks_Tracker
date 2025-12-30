import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { TrendingUp, TrendingDown, ArrowLeftRight, Calendar, CalendarCheck } from "lucide-react";

interface ValueDateDifferenceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  period: { from: Date; to: Date };
}

export function ValueDateDifferenceModal({
  open,
  onOpenChange,
  transactions,
  period
}: ValueDateDifferenceModalProps) {
  const { formatCurrency } = useUserPreferences();
  const isMobile = useIsMobile();

  // Calculer les transactions qui ont une différence entre date comptable et date valeur
  // (présentes dans une période mais pas l'autre)
  const transactionsWithDifference = transactions.filter(t => {
    const transactionDate = new Date(t.transaction_date);
    const valueDate = new Date(t.value_date);
    
    const inPeriodByTransactionDate = isWithinInterval(transactionDate, { start: period.from, end: period.to });
    const inPeriodByValueDate = isWithinInterval(valueDate, { start: period.from, end: period.to });
    
    // Transaction qui est dans la période par date comptable mais pas par date valeur
    // OU qui est dans la période par date valeur mais pas par date comptable
    return inPeriodByTransactionDate !== inPeriodByValueDate;
  });

  // Calculer l'impact: transactions incluses par date comptable mais pas par date valeur
  const includedByAccountingOnly = transactionsWithDifference.filter(t => {
    const transactionDate = new Date(t.transaction_date);
    const valueDate = new Date(t.value_date);
    return isWithinInterval(transactionDate, { start: period.from, end: period.to }) &&
           !isWithinInterval(valueDate, { start: period.from, end: period.to });
  });

  // Transactions incluses par date valeur mais pas par date comptable
  const includedByValueOnly = transactionsWithDifference.filter(t => {
    const transactionDate = new Date(t.transaction_date);
    const valueDate = new Date(t.value_date);
    return !isWithinInterval(transactionDate, { start: period.from, end: period.to }) &&
           isWithinInterval(valueDate, { start: period.from, end: period.to });
  });

  // Calculer les totaux pour chaque groupe
  const calculateTotals = (txns: Transaction[]) => {
    return txns.reduce(
      (acc, t) => {
        if (t.type === 'income') acc.income += t.amount;
        else if (t.type === 'expense') acc.expense += t.amount;
        return acc;
      },
      { income: 0, expense: 0 }
    );
  };

  const accountingOnlyTotals = calculateTotals(includedByAccountingOnly);
  const valueOnlyTotals = calculateTotals(includedByValueOnly);
  
  // Différence nette si on utilise date valeur au lieu de date comptable
  // On perd les transactions "accounting only" et on gagne les transactions "value only"
  const netDifferenceIncome = valueOnlyTotals.income - accountingOnlyTotals.income;
  const netDifferenceExpense = valueOnlyTotals.expense - accountingOnlyTotals.expense;
  const netImpact = netDifferenceIncome - netDifferenceExpense;

  const getIcon = (type: string) => {
    switch (type) {
      case 'income':
        return <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-success" />;
      case 'expense':
        return <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />;
      case 'transfer':
        return <ArrowLeftRight className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />;
      default:
        return null;
    }
  };

  const content = (
    <>
      {/* Explanation */}
      <div className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4 p-2 sm:p-3 bg-muted/30 rounded-lg">
        <p>
          La <strong>date comptable</strong> est la date d'enregistrement de la transaction, 
          tandis que la <strong>date valeur</strong> est la date effective de crédit/débit sur le compte.
        </p>
        <p className="mt-1 sm:mt-2">
          Les transactions ci-dessous ont des dates différentes et impactent les calculs selon le mode choisi.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1 sm:gap-2 py-2 sm:py-3 border-y border-border">
        <div className="text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Revenus (diff)</p>
          <p className={`font-semibold text-xs sm:text-sm ${netDifferenceIncome >= 0 ? 'text-success' : 'text-destructive'}`}>
            {netDifferenceIncome >= 0 ? '+' : ''}{formatCurrency(netDifferenceIncome)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Dépenses (diff)</p>
          <p className={`font-semibold text-xs sm:text-sm ${netDifferenceExpense <= 0 ? 'text-success' : 'text-destructive'}`}>
            {netDifferenceExpense >= 0 ? '+' : ''}{formatCurrency(netDifferenceExpense)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Impact net</p>
          <p className={`font-semibold text-xs sm:text-sm ${netImpact >= 0 ? 'text-success' : 'text-destructive'}`}>
            {netImpact >= 0 ? '+' : ''}{formatCurrency(netImpact)}
          </p>
        </div>
      </div>

      {/* Transaction lists */}
      <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 py-2 sm:py-3">
        {transactionsWithDifference.length === 0 ? (
          <div className="text-center py-4 sm:py-6 text-muted-foreground">
            <Calendar className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs sm:text-sm">Aucune différence de date sur cette période</p>
            <p className="text-[10px] sm:text-xs mt-1">Toutes les transactions ont la même date comptable et date valeur</p>
          </div>
        ) : (
          <>
            {/* Transactions only in accounting date */}
            {includedByAccountingOnly.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                  <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">
                    Incluses par date comptable uniquement
                  </span>
                </div>
                <div className="space-y-1 sm:space-y-1.5">
                  {includedByAccountingOnly.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-1.5 sm:p-2 rounded-lg border border-border/50 bg-muted/20"
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                        {getIcon(t.type)}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-[10px] sm:text-xs">{t.description}</p>
                          <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                            Comptable: {format(new Date(t.transaction_date), 'dd/MM', { locale: fr })}
                            {' → '}
                            Valeur: {format(new Date(t.value_date), 'dd/MM', { locale: fr })}
                          </p>
                        </div>
                      </div>
                      <p className={`font-bold text-[10px] sm:text-xs flex-shrink-0 ml-2 ${
                        t.type === 'income' ? 'text-success' : t.type === 'expense' ? 'text-destructive' : 'text-primary'
                      }`}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transactions only in value date */}
            {includedByValueOnly.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
                  <CalendarCheck className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                  <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">
                    Incluses par date valeur uniquement
                  </span>
                </div>
                <div className="space-y-1 sm:space-y-1.5">
                  {includedByValueOnly.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-1.5 sm:p-2 rounded-lg border border-border/50 bg-muted/20"
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                        {getIcon(t.type)}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-[10px] sm:text-xs">{t.description}</p>
                          <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                            Comptable: {format(new Date(t.transaction_date), 'dd/MM', { locale: fr })}
                            {' → '}
                            Valeur: {format(new Date(t.value_date), 'dd/MM', { locale: fr })}
                          </p>
                        </div>
                      </div>
                      <p className={`font-bold text-[10px] sm:text-xs flex-shrink-0 ml-2 ${
                        t.type === 'income' ? 'text-success' : t.type === 'expense' ? 'text-destructive' : 'text-primary'
                      }`}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4" />
              Différence Date Comptable / Valeur
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 flex flex-col overflow-hidden">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Différence Date Comptable / Valeur
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col overflow-hidden flex-1">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}