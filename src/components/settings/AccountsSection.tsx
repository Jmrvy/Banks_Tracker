import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Edit3, Save, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BANK_IDS, getBankLabel } from "@/lib/constants";
import type { Account } from "@/hooks/useFinancialData";

interface AccountsSectionProps {
  accounts: Account[];
  refetch: () => void;
  formatCurrency: (amount: number) => string;
}

interface EditingValues {
  name: string;
  bank: string;
}

export const AccountsSection = ({ accounts, refetch, formatCurrency }: AccountsSectionProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<EditingValues>({ name: "", bank: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const startEditing = (account: Account) => {
    setEditingAccount(account.id);
    setEditingValues({ name: account.name, bank: account.bank });
  };

  const saveAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from('accounts')
        .update({ name: editingValues.name, bank: editingValues.bank as Account['bank'] })
        .eq('id', accountId);

      if (error) throw error;

      setEditingAccount(null);
      refetch();

      toast({
        title: t('accounts.accountUpdated'),
        description: t('settings.preferencesSavedDesc'),
      });
    } catch {
      toast({
        title: t('common.error'),
        description: t('errors.updateError'),
        variant: "destructive"
      });
    }
  };

  const handleDelete = (accountId: string) => {
    setDeleteId(accountId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      refetch();
      toast({
        title: t('accounts.accountDeleted'),
        description: t('settings.preferencesSavedDesc'),
      });
    } catch {
      toast({
        title: t('common.error'),
        description: t('errors.deleteError'),
        variant: "destructive"
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 sm:h-5 sm:w-5" />
            <CardTitle className="text-sm sm:text-base">{t('settings.myAccounts')}</CardTitle>
          </div>
          <CardDescription className="text-xs sm:text-sm hidden sm:block">
            {t('settings.manageAccounts')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          <div className="space-y-2 sm:space-y-3">
            {accounts.map((account) => (
              <div key={account.id} className="p-3 border rounded-lg bg-muted/30 dark:bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {editingAccount === account.id ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          value={editingValues.name}
                          onChange={(e) => setEditingValues(prev => ({ ...prev, name: e.target.value }))}
                          placeholder={t('accounts.accountName')}
                          className="h-8 sm:h-10 text-xs sm:text-sm"
                        />
                        <Select
                          value={editingValues.bank}
                          onValueChange={(value) => setEditingValues(prev => ({ ...prev, bank: value }))}
                        >
                          <SelectTrigger className="h-8 sm:h-10 text-xs sm:text-sm">
                            <SelectValue placeholder={t('accounts.bank')} />
                          </SelectTrigger>
                          <SelectContent>
                            {BANK_IDS.map((bankId) => (
                              <SelectItem key={bankId} value={bankId}>
                                {getBankLabel(bankId, t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-foreground">{account.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-muted-foreground capitalize">
                            {getBankLabel(account.bank, t)}
                          </p>
                          <span className="text-xs text-muted-foreground">•</span>
                          <p className="text-xs font-semibold text-foreground">
                            {formatCurrency(Number(account.balance))}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {editingAccount === account.id ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => saveAccount(account.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                          <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingAccount(null)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                          <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => startEditing(account)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                          <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(account.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={confirmDelete}
        title={t('confirmations.deleteTitle')}
        description={t('accounts.confirmDelete')}
      />
    </>
  );
};
