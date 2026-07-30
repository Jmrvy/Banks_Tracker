import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Slider } from "@/components/ui/slider";
import {
  Search,
  X,
  Filter,
  Calendar,
  Wallet,
  Tag,
  DollarSign,
  History,
  Undo2,
} from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface TransactionFilters {
  searchText: string;
  type: string;
  categoryId: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  /**
   * Refund-link filter. Refunds are a two-sided relation, so this is a
   * tri-state rather than a boolean:
   *   'all'       — no filtering
   *   'refunded'  — the transaction has been refunded (refunded_amount > 0)
   *   'is_refund' — the transaction *is* a refund of another one
   * Optional so callers that build filters literally (Budget → Transactions)
   * don't have to know about it.
   */
  refund?: 'all' | 'refunded' | 'is_refund';
  /**
   * Optional override for which date column the dateFrom/dateTo range
   * applies to. When set, takes precedence over the user's global
   * preferences.dateType. Used when navigating from Budget so the
   * filtered set matches exactly what the budget card was counting.
   */
  dateType?: "accounting" | "value";
}

interface TransactionSearchProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  activeFiltersCount: number;
}

export const TransactionSearch = ({ filters, onFiltersChange, activeFiltersCount }: TransactionSearchProps) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const { categories, accounts, transactions } = useFinancialData();
  const [isOpen, setIsOpen] = useState(false);

  const maxAmount = useMemo(() => {
    if (transactions.length === 0) return 1000;
    const max = Math.max(...transactions.map((t) => Math.abs(t.amount)));
    return Math.ceil(max) || 1000;
  }, [transactions]);

  const updateFilter = (key: keyof TransactionFilters, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      searchText: '',
      type: 'all',
      categoryId: 'all',
      accountId: 'all',
      dateFrom: '',
      dateTo: '',
      amountMin: '',
      amountMax: '',
      refund: 'all',
    });
  };

  const refundFilter = filters.refund ?? 'all';

  // Type segmented control matching the deck's "All / Income / Expenses / Transfers"
  const typeSegments = [
    { value: 'all', label: t('common.all', { defaultValue: 'All' }) },
    { value: 'income', label: t('common.income', { defaultValue: 'Income' }) },
    { value: 'expense', label: t('common.expenses', { defaultValue: 'Expenses' }) },
    { value: 'transfer', label: t('common.transfers', { defaultValue: 'Transfers' }) },
  ];

  // Active filter chips
  const advancedFiltersCount = [
    filters.categoryId !== 'all',
    filters.accountId !== 'all',
    filters.dateFrom,
    filters.dateTo,
    filters.amountMin,
    filters.amountMax,
    refundFilter !== 'all',
  ].filter(Boolean).length;

  const refundFilterLabel = refundFilter === 'refunded'
    ? t('transactions.hasRefund', { defaultValue: 'Has refund' })
    : refundFilter === 'is_refund'
      ? t('transactions.isRefund', { defaultValue: 'Is a refund' })
      : null;

  const categoryFilterLabel = filters.categoryId !== 'all'
    ? categories.find((c) => c.id === filters.categoryId)?.name
    : null;
  const accountFilterLabel = filters.accountId !== 'all'
    ? accounts.find((a) => a.id === filters.accountId)?.name
    : null;
  const dateFilterLabel = filters.dateFrom || filters.dateTo
    ? [
        filters.dateFrom && format(parseISO(filters.dateFrom), 'd MMM', { locale: dateLocale }),
        filters.dateTo && format(parseISO(filters.dateTo), 'd MMM', { locale: dateLocale }),
      ]
        .filter(Boolean)
        .join(' → ')
    : null;

  return (
    <>
      {/* Filter bar — single ft-card containing search + segmented type + filter buttons */}
      <div className="ft-card p-3 sm:p-3.5 md:p-4 flex flex-col gap-2.5 sm:gap-3">
        <div className="flex flex-col md:flex-row md:flex-wrap gap-2 items-stretch md:items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t('transactions.searchPlaceholder', {
                defaultValue: 'Search merchant, amount, note…',
              })}
              value={filters.searchText}
              onChange={(e) => updateFilter('searchText', e.target.value)}
              className="pl-8 pr-7 h-9 text-sm"
            />
            {filters.searchText && (
              <button
                onClick={() => updateFilter('searchText', '')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-bg-hover transition-colors"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Segmented type toggle — horizontal scroll on narrow screens */}
          <div className="-mx-1 px-1 overflow-x-auto md:mx-0 md:px-0 md:overflow-visible">
            <div className="ft-seg flex-shrink-0 w-fit">
              {typeSegments.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={filters.type === s.value ? 'active' : ''}
                  onClick={() => updateFilter('type', s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick "Has refund" chip — refund linking is a power feature that
              was otherwise only reachable from the detail modal. One click
              narrows the list to transactions carrying a refund; the full
              tri-state (incl. "is a refund") lives in advanced filters. */}
          <button
            type="button"
            onClick={() =>
              updateFilter('refund', refundFilter === 'refunded' ? 'all' : 'refunded')
            }
            aria-pressed={refundFilter === 'refunded'}
            className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors flex-shrink-0 ${
              refundFilter === 'refunded'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-line text-muted-foreground hover:text-foreground hover:bg-bg-hover'
            }`}
          >
            <Undo2 className="h-3.5 w-3.5" />
            {t('transactions.hasRefund', { defaultValue: 'Has refund' })}
          </button>

          {/* Single Advanced filter toggle */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(true)}
              className={`h-9 px-3 gap-1.5 text-xs ${advancedFiltersCount > 0 ? "border-primary text-primary" : ""}`}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>{t("transactions.advancedFilters", { defaultValue: "Advanced filter" })}</span>
              {advancedFiltersCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {advancedFiltersCount}
                </span>
              )}
            </Button>
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {t("transactions.clearAll", { defaultValue: "Clear all" })}
              </Button>
            )}
          </div>
        </div>

        {/* Active filter chips — quick visual recap of what's currently applied */}
        {advancedFiltersCount > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center pt-1">
            {categoryFilterLabel && (
              <span className="ft-tag acc gap-1.5 pl-2 pr-1 py-0.5">
                <Tag className="h-3 w-3" />
                <span className="truncate max-w-[140px]">{categoryFilterLabel}</span>
                <button
                  type="button"
                  onClick={() => updateFilter("categoryId", "all")}
                  className="p-0.5 rounded hover:bg-foreground/10"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {accountFilterLabel && (
              <span className="ft-tag acc gap-1.5 pl-2 pr-1 py-0.5">
                <Wallet className="h-3 w-3" />
                <span className="truncate max-w-[140px]">{accountFilterLabel}</span>
                <button
                  type="button"
                  onClick={() => updateFilter("accountId", "all")}
                  className="p-0.5 rounded hover:bg-foreground/10"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {dateFilterLabel && (
              <span className="ft-tag acc gap-1.5 pl-2 pr-1 py-0.5">
                <History className="h-3 w-3" />
                <span className="truncate max-w-[180px]">{dateFilterLabel}</span>
                <button
                  type="button"
                  onClick={() => onFiltersChange({ ...filters, dateFrom: "", dateTo: "" })}
                  className="p-0.5 rounded hover:bg-foreground/10"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {refundFilterLabel && (
              <span className="ft-tag acc gap-1.5 pl-2 pr-1 py-0.5">
                <Undo2 className="h-3 w-3" />
                <span className="truncate max-w-[140px]">{refundFilterLabel}</span>
                <button
                  type="button"
                  onClick={() => updateFilter("refund", "all")}
                  className="p-0.5 rounded hover:bg-foreground/10"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {(filters.amountMin || filters.amountMax) && (
              <span className="ft-tag acc gap-1.5 pl-2 pr-1 py-0.5">
                <DollarSign className="h-3 w-3" />
                <span className="truncate max-w-[140px]">
                  {filters.amountMin || "0"}€ – {filters.amountMax || "∞"}€
                </span>
                <button
                  type="button"
                  onClick={() => onFiltersChange({ ...filters, amountMin: "", amountMax: "" })}
                  className="p-0.5 rounded hover:bg-foreground/10"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Advanced filters dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4 text-primary" />
              {t('transactions.advancedFilters', { defaultValue: 'Advanced filters' })}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                {t('transactions.category', { defaultValue: 'Category' })}
              </label>
              <Select value={filters.categoryId} onValueChange={(value) => updateFilter('categoryId', value)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t('transactions.allCategories', { defaultValue: 'All categories' })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('transactions.allCategories', { defaultValue: 'All categories' })}</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Account */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" />
                {t('transactions.account', { defaultValue: 'Account' })}
              </label>
              <Select value={filters.accountId} onValueChange={(value) => updateFilter('accountId', value)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t('transactions.allAccounts', { defaultValue: 'All accounts' })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('transactions.allAccounts', { defaultValue: 'All accounts' })}</SelectItem>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {t('transactions.period', { defaultValue: 'Period' })}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <DatePicker
                  date={filters.dateFrom ? parseISO(filters.dateFrom) : undefined}
                  onDateChange={(date) => updateFilter('dateFrom', date ? format(date, 'yyyy-MM-dd') : '')}
                  placeholder={t('common.from', { defaultValue: 'From' })}
                />
                <DatePicker
                  date={filters.dateTo ? parseISO(filters.dateTo) : undefined}
                  onDateChange={(date) => updateFilter('dateTo', date ? format(date, 'yyyy-MM-dd') : '')}
                  placeholder={t('common.until', { defaultValue: 'Until' })}
                />
              </div>
            </div>

            {/* Refund link */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Undo2 className="h-3.5 w-3.5" />
                {t('transactions.refund', { defaultValue: 'Refund' })}
              </label>
              <Select value={refundFilter} onValueChange={(value) => updateFilter('refund', value)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('transactions.anyRefundState', { defaultValue: 'Any' })}
                  </SelectItem>
                  <SelectItem value="refunded">
                    {t('transactions.hasRefund', { defaultValue: 'Has refund' })}
                  </SelectItem>
                  <SelectItem value="is_refund">
                    {t('transactions.isRefund', { defaultValue: 'Is a refund' })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount range */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                {t('transactions.amount', { defaultValue: 'Amount' })}
              </label>
              <Slider
                min={0}
                max={maxAmount}
                step={maxAmount <= 100 ? 1 : maxAmount <= 1000 ? 5 : maxAmount <= 10000 ? 10 : 50}
                value={[
                  filters.amountMin ? Number(filters.amountMin) : 0,
                  filters.amountMax ? Number(filters.amountMax) : maxAmount,
                ]}
                onValueChange={([min, max]) => {
                  onFiltersChange({
                    ...filters,
                    amountMin: min > 0 ? String(min) : '',
                    amountMax: max < maxAmount ? String(max) : '',
                  });
                }}
                className="py-2"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono font-medium text-foreground">
                  {filters.amountMin ? `${filters.amountMin} €` : '0 €'}
                </span>
                <span className="font-mono font-medium text-foreground">
                  {filters.amountMax ? `${filters.amountMax} €` : `${maxAmount} €`}
                </span>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5 pt-3 flex-shrink-0 flex gap-2 border-t border-line">
            {activeFiltersCount > 0 && (
              <Button
                variant="outline"
                onClick={() => { clearFilters(); setIsOpen(false); }}
                size="sm"
                className="flex-1 h-9 gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                {t('common.reset', { defaultValue: 'Reset' })}
              </Button>
            )}
            <Button
              onClick={() => setIsOpen(false)}
              size="sm"
              className="flex-1 h-9 font-semibold"
            >
              {t('common.apply', { defaultValue: 'Apply' })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
