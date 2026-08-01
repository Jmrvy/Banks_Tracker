import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLinkRefund, type RefundCandidate } from "@/hooks/useLinkRefund";
import { describeError } from "@/lib/errorMessage";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The income transaction being attached to an expense. */
  transaction: {
    id: string;
    description: string;
    amount: number;
    transaction_date: string;
    account_id: string;
  } | null;
  onLinked: () => void;
}

/**
 * Picks the expense an already-recorded income transaction refunds.
 *
 * The candidates are ranked, not chosen. Matching a reimbursement to its
 * purchase is a judgement about what happened, and a wrong link silently
 * understates a real cost in the budget it belongs to — so the list leads
 * with the likeliest row and waits.
 */
export function LinkRefundModal({ open, onOpenChange, transaction, onLinked }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { findCandidates, linkRefund } = useLinkRefund();
  const { formatCurrency } = useUserPreferences();
  const [candidates, setCandidates] = useState<RefundCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !transaction) return;
    let cancelled = false;
    setLoading(true);
    findCandidates(transaction)
      .then((rows) => {
        if (!cancelled) setCandidates(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          toast({
            title: t("common.error", { defaultValue: "Error" }),
            description: describeError(err),
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, transaction, findCandidates, toast, t]);

  const handleLink = async (candidate: RefundCandidate) => {
    if (!transaction) return;
    setLinkingId(candidate.id);
    const { error } = await linkRefund(transaction.id, candidate.id);
    setLinkingId(null);
    if (error) {
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description: describeError(error),
        variant: "destructive",
      });
      return;
    }
    toast({
      title: t("transactions.refundLinked", { defaultValue: "Linked as a refund" }),
      description: t("transactions.refundLinkedDesc", {
        defaultValue: "The expense now counts net of this refund.",
      }),
    });
    onLinked();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-base">
            {t("transactions.linkRefundTitle", { defaultValue: "Which expense does this refund?" })}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {transaction
              ? t("transactions.linkRefundDesc", {
                  amount: formatCurrency(transaction.amount),
                  defaultValue: `Attaching ${formatCurrency(transaction.amount)}. The expense will count net of it, and this row will leave the income figures.`,
                })
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {loading ? (
            <p className="text-xs text-muted-foreground py-4">
              {t("common.loading", { defaultValue: "Loading…" })}
            </p>
          ) : candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              {t("transactions.noRefundCandidates", {
                defaultValue:
                  "No expense on or before this date still has an unrefunded amount. It may be genuine income rather than a refund.",
              })}
            </p>
          ) : (
            <div className="flex flex-col divide-y">
              {candidates.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate">{c.description}</span>
                      {i === 0 && (
                        <Badge variant="secondary" className="text-[10px] h-4 shrink-0">
                          {t("transactions.bestMatch", { defaultValue: "closest" })}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.transaction_date}
                      {c.category_name ? ` · ${c.category_name}` : ""}
                      {" · "}
                      {t("transactions.refundableLeft", {
                        amount: formatCurrency(c.remaining),
                        defaultValue: `${formatCurrency(c.remaining)} refundable`,
                      })}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 shrink-0"
                    disabled={linkingId !== null}
                    onClick={() => handleLink(c)}
                  >
                    {linkingId === c.id
                      ? t("common.saving", { defaultValue: "Saving…" })
                      : t("transactions.link", { defaultValue: "Link" })}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end px-4 py-3 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("common.close", { defaultValue: "Close" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
