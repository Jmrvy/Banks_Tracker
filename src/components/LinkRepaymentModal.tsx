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
import { useLinkRepayment, type RepaymentCandidate } from "@/hooks/useLinkRepayment";
import { describeError } from "@/lib/errorMessage";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The expense being attached to the income it settles. */
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
 * Picks the income an already-recorded expense repays.
 *
 * The mirror of LinkRefundModal. Ranked, never chosen: linking the wrong
 * advance would erase income that was genuinely earned, so the list leads
 * with the likeliest row and waits.
 */
export function LinkRepaymentModal({ open, onOpenChange, transaction, onLinked }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { findCandidates, linkRepayment } = useLinkRepayment();
  const { formatCurrency } = useUserPreferences();
  const [candidates, setCandidates] = useState<RepaymentCandidate[]>([]);
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

  const handleLink = async (candidate: RepaymentCandidate) => {
    if (!transaction) return;
    setLinkingId(candidate.id);
    const { error } = await linkRepayment(transaction.id, candidate.id);
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
      title: t("transactions.repaymentLinked", { defaultValue: "Linked as a repayment" }),
      description: t("transactions.repaymentLinkedDesc", {
        defaultValue: "The income now counts net of this repayment.",
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
            {t("transactions.linkRepaymentTitle", { defaultValue: "Which income does this repay?" })}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {transaction
              ? t("transactions.linkRepaymentDesc", {
                  amount: formatCurrency(transaction.amount),
                  defaultValue: `Attaching ${formatCurrency(transaction.amount)}. The income will count net of it, and this row will stop counting as spending.`,
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
              {t("transactions.noRepaymentCandidates", {
                defaultValue:
                  "No income on or before this date still has an outstanding amount. This may be genuine spending rather than a repayment.",
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
                      {t("transactions.outstandingLeft", {
                        amount: formatCurrency(c.remaining),
                        defaultValue: `${formatCurrency(c.remaining)} outstanding`,
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
