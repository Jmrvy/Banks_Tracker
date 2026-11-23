import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, Info } from 'lucide-react';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { formatInCurrency } from '@/lib/fx';
import type { ForeignLeg } from '@/hooks/useForeignLeg';

const fmtRate = (r: number) => r.toLocaleString(undefined, { maximumFractionDigits: 4 });

/**
 * The currency rows of a transaction form: a "you receive" amount and its
 * rate for a conversion, the euro value of spending in a subaccount, or a
 * refusal for subaccount-to-subaccount transfers. Renders nothing for
 * ordinary base-currency transactions.
 */
export function ForeignLegFields({ fx, idPrefix = 'fx' }: { fx: ForeignLeg; idPrefix?: string }) {
  const { t, i18n } = useTranslation();
  const { formatCurrency } = useUserPreferences();
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB';

  if (fx.mode === 'none') return null;

  if (fx.mode === 'unsupported') {
    return (
      <p className="text-[12px] text-destructive">
        {t('fx.unsupported', {
          defaultValue: 'Transfers between two currency subaccounts are not supported. Go through the main account.',
        })}
      </p>
    );
  }

  const cur = fx.currency as string;
  const rateLine = (r: number) => `1 ${cur} = ${fmtRate(r)} ${fx.base}`;

  if (fx.mode === 'spend') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-line-soft bg-bg-subtle px-3 py-2 text-[12px] text-fg-mute">
        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          {t('fx.spendHint', {
            defaultValue: 'Amount in {{currency}}. Counted as {{base}} in your stats, at your average rate ({{rate}}).',
            currency: cur,
            base: fx.legs.foreign_amount ? formatCurrency(fx.legs.amount) : fx.base,
            rate: rateLine(fx.rate),
          })}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line-soft bg-bg-subtle p-3 space-y-3">
      <div className="flex items-center gap-2 text-[12px] font-semibold">
        <ArrowRightLeft className="h-3.5 w-3.5" />
        {fx.mode === 'convert_in'
          ? t('fx.convertInTitle', { defaultValue: 'Conversion into {{currency}}', currency: cur })
          : t('fx.convertOutTitle', { defaultValue: 'Conversion back to {{currency}}', currency: fx.base })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-received`} className="text-[12px]">
            {t('fx.youReceive', { defaultValue: 'You receive ({{currency}})', currency: fx.receivedCurrency })}
          </Label>
          <AmountInput
            id={`${idPrefix}-received`}
            placeholder="0.00"
            value={fx.receivedValue}
            onChange={fx.setReceived}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-rate`} className="text-[12px]">
            {t('fx.rateLabel', { defaultValue: 'Rate: 1 {{currency}} = … {{base}}', currency: cur, base: fx.base })}
          </Label>
          <AmountInput
            id={`${idPrefix}-rate`}
            placeholder="1.0000"
            value={fx.rateValue}
            onChange={fx.setRate}
            className="h-9"
          />
        </div>
      </div>
      <div className="text-[11.5px] text-fg-mute space-y-0.5">
        {fx.marketRate && (
          <div>
            {t('fx.todayRate', { defaultValue: "Today's rate: {{rate}}", rate: rateLine(fx.marketRate) })}{' '}
            <button type="button" onClick={fx.useMarketRate} className="underline underline-offset-2 hover:text-foreground">
              {t('fx.useIt', { defaultValue: 'use it' })}
            </button>
          </div>
        )}
        {fx.mode === 'convert_in' && fx.avgRate && (
          <div>
            {t('fx.averageNow', { defaultValue: 'Your average rate now: {{rate}}', rate: rateLine(fx.avgRate) })}
            {fx.averageAfter != null &&
              ` · ${t('fx.averageAfter', { defaultValue: 'after this: {{rate}}', rate: fmtRate(fx.averageAfter) })}`}
          </div>
        )}
        {fx.mode === 'convert_out' && (
          <div>
            {t('fx.convertOutHint', {
              defaultValue: 'Leaves {{amount}} on the subaccount. Your average rate does not change.',
              amount: formatInCurrency(fx.legs.foreign_amount ?? 0, cur, locale),
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** "100,00 £" beside a base amount, for rows that moved a subaccount. */
export function ForeignAmountTag({
  amount,
  currency,
  className = '',
}: {
  amount: number | null | undefined;
  currency: string | null | undefined;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const { isPrivacyMode } = usePrivacy();
  if (amount == null || !currency || isPrivacyMode) return null;
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB';
  return (
    <span className={`font-mono tabular-nums text-[11px] text-fg-mute whitespace-nowrap ${className}`}>
      {formatInCurrency(Number(amount), currency, locale)}
    </span>
  );
}
