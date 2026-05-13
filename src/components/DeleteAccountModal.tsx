import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, Receipt, ArrowLeftRight, RefreshCw, CreditCard, History } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData, type Account } from '@/hooks/useFinancialData';

interface DeleteAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  onDeleted?: () => void;
}

interface Impact {
  account_name?: string;
  transactions?: number;
  inbound_transfers?: number;
  recurring?: number;
  installments?: number;
  installment_history?: number;
}

export function DeleteAccountModal({ open, onOpenChange, account, onDeleted }: DeleteAccountModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { getAccountDeletionImpact, deleteAccount } = useFinancialData();

  const [impact, setImpact] = useState<Impact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !account) {
      setImpact(null);
      setConfirmName('');
      return;
    }
    let cancelled = false;
    setLoadingImpact(true);
    getAccountDeletionImpact(account.id).then(({ error, impact: result }) => {
      if (cancelled) return;
      if (error) {
        toast({
          title: t('common.error'),
          description: error.message,
          variant: 'destructive',
        });
        setImpact(null);
      } else {
        setImpact(result);
      }
      setLoadingImpact(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, account?.id]);

  if (!account) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    const { error } = await deleteAccount(account.id);
    setSubmitting(false);
    if (error) {
      toast({
        title: t('accounts.deleteFailed', { defaultValue: 'Could not delete account' }),
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: t('accounts.deletedTitle', { defaultValue: 'Account deleted' }),
      description: t('accounts.deletedDesc', {
        defaultValue: '“{{name}}” and all its data have been removed.',
        name: account.name,
      }),
    });
    onOpenChange(false);
    onDeleted?.();
  };

  const txCount = impact?.transactions ?? 0;
  const inboundCount = impact?.inbound_transfers ?? 0;
  const recurringCount = impact?.recurring ?? 0;
  const installmentsCount = impact?.installments ?? 0;
  const historyCount = impact?.installment_history ?? 0;

  const totalAffected = txCount + recurringCount + installmentsCount + historyCount;
  const nameMatches = confirmName.trim() === account.name;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {t('accounts.deleteTitle', { defaultValue: 'Delete account' })}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                {t('accounts.deleteIntro', {
                  defaultValue:
                    'This will permanently delete “{{name}}” and everything attached to it. This is irreversible.',
                  name: account.name,
                })}
              </p>

              {loadingImpact ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : impact ? (
                <div className="space-y-2">
                  <p className="font-medium text-foreground">
                    {totalAffected === 0
                      ? t('accounts.deleteNoData', {
                          defaultValue: 'No transactions or schedules attached.',
                        })
                      : t('accounts.deleteImpactHeading', {
                          defaultValue: 'What will be deleted:',
                        })}
                  </p>
                  {totalAffected > 0 && (
                    <ul className="rounded-md border bg-muted/40 divide-y divide-border text-[13px]">
                      <ImpactRow
                        icon={<Receipt className="h-3.5 w-3.5" />}
                        label={t('accounts.transactions', { defaultValue: 'Transactions' })}
                        count={txCount}
                      />
                      {recurringCount > 0 && (
                        <ImpactRow
                          icon={<RefreshCw className="h-3.5 w-3.5" />}
                          label={t('accounts.recurring', { defaultValue: 'Recurring transactions' })}
                          count={recurringCount}
                        />
                      )}
                      {installmentsCount > 0 && (
                        <ImpactRow
                          icon={<CreditCard className="h-3.5 w-3.5" />}
                          label={t('accounts.installments', { defaultValue: 'Installment plans' })}
                          count={installmentsCount}
                        />
                      )}
                      {historyCount > 0 && (
                        <ImpactRow
                          icon={<History className="h-3.5 w-3.5" />}
                          label={t('accounts.installmentHistory', {
                            defaultValue: 'Installment history entries',
                          })}
                          count={historyCount}
                        />
                      )}
                    </ul>
                  )}
                  {inboundCount > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12px] leading-relaxed">
                      <div className="flex items-start gap-2">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <span>
                          {t('accounts.inboundTransfersNotice', {
                            defaultValue:
                              '{{n}} transfer(s) from other accounts into this one will also be deleted. The source accounts will keep their pre-transfer balances.',
                            n: inboundCount,
                          })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="space-y-1.5 pt-1">
                <Label htmlFor="confirm-name" className="text-xs">
                  {t('accounts.deleteTypeName', {
                    defaultValue: 'Type the account name to confirm:',
                  })}{' '}
                  <span className="font-mono font-semibold">{account.name}</span>
                </Label>
                <Input
                  id="confirm-name"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  autoComplete="off"
                  placeholder={account.name}
                  className="h-9"
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={submitting || loadingImpact || !nameMatches}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {t('accounts.deleteConfirm', { defaultValue: 'Delete account' })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ImpactRow({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-mono font-medium tabular-nums">{count}</span>
    </div>
  );
}
