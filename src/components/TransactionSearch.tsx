import { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Filter } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

  return (
    <Card className="border-0 shadow-md">
      <CardContent className="pt-4 space-y-3">
        {/* Barre de recherche principale */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une transaction..."
              value={filters.searchText}
              onChange={(e) => updateFilter('searchText', e.target.value)}
              className="pl-9"
            />
          </div>
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="relative">
                <Filter className="h-4 w-4 mr-2" />
                Filtres
                {activeFiltersCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
                  >
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>

        {/* Filtres avancés */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Type de transaction */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select value={filters.type} onValueChange={(value) => updateFilter('type', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="income">Revenus</SelectItem>
                    <SelectItem value="expense">Dépenses</SelectItem>
                    <SelectItem value="transfer">Virements</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Catégorie */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Catégorie</label>
                <Select value={filters.categoryId} onValueChange={(value) => updateFilter('categoryId', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Compte */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Compte</label>
                <Select value={filters.accountId} onValueChange={(value) => updateFilter('accountId', value)}>
                  <SelectTrigger>
                    <SelectValue />
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

              {/* Date de début */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Date de début</label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => updateFilter('dateFrom', e.target.value)}
                />
              </div>

              {/* Date de fin */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Date de fin</label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => updateFilter('dateTo', e.target.value)}
                />
              </div>

              {/* Montant minimum */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Montant min (€)</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={filters.amountMin}
                  onChange={(e) => updateFilter('amountMin', e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>

              {/* Montant maximum */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Montant max (€)</label>
                <Input
                  type="number"
                  placeholder="∞"
                  value={filters.amountMax}
                  onChange={(e) => updateFilter('amountMax', e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            {/* Bouton pour réinitialiser */}
            {activeFiltersCount > 0 && (
              <Button 
                variant="outline" 
                onClick={clearFilters}
                className="w-full"
              >
                <X className="h-4 w-4 mr-2" />
                Réinitialiser les filtres
              </Button>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};
