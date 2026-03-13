import { useState } from 'react';
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Search, X, Filter, SlidersHorizontal, Calendar, CreditCard, Tag, DollarSign } from "lucide-react";
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
}

interface TransactionSearchProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  activeFiltersCount: number;
}

export const TransactionSearch = ({ filters, onFiltersChange, activeFiltersCount }: TransactionSearchProps) => {
  const { categories, accounts } = useFinancialData();
  const [isOpen, setIsOpen] = useState(false);

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
    });
  };

  // Quick filter chips for transaction type
  const typeChips = [
    { value: 'all', label: 'Tout' },
    { value: 'expense', label: 'Dépenses' },
    { value: 'income', label: 'Revenus' },
    { value: 'transfer', label: 'Virements' },
  ];

  // Count active advanced filters (excluding search + type which are always visible)
  const advancedFiltersCount = [
    filters.categoryId !== 'all',
    filters.accountId !== 'all',
    filters.dateFrom,
    filters.dateTo,
    filters.amountMin,
    filters.amountMax,
  ].filter(Boolean).length;

  return (
    <>
      <div className="space-y-3">
        {/* Search bar + filter button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={filters.searchText}
              onChange={(e) => updateFilter('searchText', e.target.value)}
              className="pl-9 pr-8"
            />
            {filters.searchText && (
              <button
                onClick={() => updateFilter('searchText', '')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-white/[0.06] transition-colors"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="relative h-10 w-10 flex-shrink-0"
            onClick={() => setIsOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {advancedFiltersCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-4 w-4 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {advancedFiltersCount}
              </span>
            )}
          </Button>
        </div>

        {/* Type chips - always visible */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
          {typeChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => updateFilter('type', chip.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 border ${
                filters.type === chip.value
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-white/[0.03] text-muted-foreground border-white/[0.06] hover:bg-white/[0.06]'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Active filter tags */}
        {advancedFiltersCount > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filters.categoryId !== 'all' && (
              <Badge variant="secondary" className="gap-1 pr-1 text-xs">
                <Tag className="h-3 w-3" />
                {categories.find(c => c.id === filters.categoryId)?.name || 'Catégorie'}
                <button onClick={() => updateFilter('categoryId', 'all')} className="ml-0.5 p-0.5 rounded-full hover:bg-white/[0.1]">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )}
            {filters.accountId !== 'all' && (
              <Badge variant="secondary" className="gap-1 pr-1 text-xs">
                <CreditCard className="h-3 w-3" />
                {accounts.find(a => a.id === filters.accountId)?.name || 'Compte'}
                <button onClick={() => updateFilter('accountId', 'all')} className="ml-0.5 p-0.5 rounded-full hover:bg-white/[0.1]">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )}
            {(filters.dateFrom || filters.dateTo) && (
              <Badge variant="secondary" className="gap-1 pr-1 text-xs">
                <Calendar className="h-3 w-3" />
                {filters.dateFrom && format(parseISO(filters.dateFrom), 'dd MMM yyyy', { locale: fr })}
                {filters.dateFrom && filters.dateTo && ' → '}
                {filters.dateTo && format(parseISO(filters.dateTo), 'dd MMM yyyy', { locale: fr })}
                <button onClick={() => { updateFilter('dateFrom', ''); updateFilter('dateTo', ''); }} className="ml-0.5 p-0.5 rounded-full hover:bg-white/[0.1]">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )}
            {(filters.amountMin || filters.amountMax) && (
              <Badge variant="secondary" className="gap-1 pr-1 text-xs">
                <DollarSign className="h-3 w-3" />
                {filters.amountMin || '0'}€ – {filters.amountMax || '∞'}€
                <button onClick={() => { updateFilter('amountMin', ''); updateFilter('amountMax', ''); }} className="ml-0.5 p-0.5 rounded-full hover:bg-white/[0.1]">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )}
            <button
              onClick={clearFilters}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5"
            >
              Tout effacer
            </button>
          </div>
        )}
      </div>

      {/* Advanced filters modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Filter className="h-5 w-5 text-primary" />
              Filtres avancés
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                Catégorie
              </label>
              <Select value={filters.categoryId} onValueChange={(value) => updateFilter('categoryId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Toutes les catégories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
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
                <CreditCard className="h-3.5 w-3.5" />
                Compte
              </label>
              <Select value={filters.accountId} onValueChange={(value) => updateFilter('accountId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous les comptes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
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
                Période
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Du</span>
                  <DatePicker
                    date={filters.dateFrom ? parseISO(filters.dateFrom) : undefined}
                    onDateChange={(date) => updateFilter('dateFrom', date ? format(date, 'yyyy-MM-dd') : '')}
                    placeholder="Date début"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Au</span>
                  <DatePicker
                    date={filters.dateTo ? parseISO(filters.dateTo) : undefined}
                    onDateChange={(date) => updateFilter('dateTo', date ? format(date, 'yyyy-MM-dd') : '')}
                    placeholder="Date fin"
                  />
                </div>
              </div>
            </div>

            {/* Amount range */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Montant
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground">Min (€)</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={filters.amountMin}
                    onChange={(e) => updateFilter('amountMin', e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Max (€)</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="∞"
                    value={filters.amountMax}
                    onChange={(e) => updateFilter('amountMax', e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 pb-4 sm:px-6 sm:pb-6 pt-2 flex-shrink-0 flex gap-2 border-t border-white/[0.06]">
            {activeFiltersCount > 0 && (
              <Button
                variant="outline"
                onClick={() => { clearFilters(); setIsOpen(false); }}
                className="flex-1"
              >
                <X className="h-4 w-4 mr-1.5" />
                Réinitialiser
              </Button>
            )}
            <Button
              onClick={() => setIsOpen(false)}
              className="flex-1"
            >
              Appliquer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
