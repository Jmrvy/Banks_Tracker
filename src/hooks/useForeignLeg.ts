import { useState } from 'react';
import { useFxRates } from '@/hooks/useFxRates';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { foreignMode, resolveLegs, roundTo, type ForeignMode } from '@/lib/fx';
import type { Account } from '@/hooks/useFinancialData';

type TxType = 'income' | 'expense' | 'transfer';

interface Seed {
  type: TxType;
  account_id: string;
  to_account_id?: string | null;
  /** The figure for the other side of a conversion, as typed. */
  receivedText: string;
}

interface State {
  key: string;
  rateText: string | null;
  receivedText: string | null;
  lastEdited: 'rate' | 'received' | null;
}

const parse = (s: string | null | undefined) => {
  const n = parseFloat(String(s ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const trimRate = (r: number) => String(Number(r.toFixed(6)));

/**
 * The currency side of a transaction form. Given the type, the accounts it
 * touches and the amount typed, works out which currency that amount is in,
 * the conversion figures the user can adjust (what arrives, at which rate)
 * and the `amount` / `foreign_amount` pair to save.
 *
 * The typed amount is always in the SOURCE account's currency.
 */
export function useForeignLeg(args: {
  type: TxType;
  source: Account | null | undefined;
  dest?: Account | null;
  entered: string;
  /** Edit forms: the saved conversion, applied while the same accounts stay selected. */
  seed?: Seed | null;
}) {
  const { preferences } = useUserPreferences();
  const base = preferences.currency || 'EUR';
  const mode: ForeignMode = foreignMode(args.type, args.source, args.dest);
  const foreignAccount =
    mode === 'convert_in' ? args.dest : mode === 'spend' || mode === 'convert_out' ? args.source : null;
  const currency = foreignAccount?.currency ?? null;
  const { rates } = useFxRates(base, currency ? [currency] : []);
  const marketRate = currency ? rates[currency] : undefined;
  const avgRate = Number(foreignAccount?.fx_rate) || undefined;

  const key = `${args.type}:${args.source?.id ?? ''}:${args.type === 'transfer' ? args.dest?.id ?? '' : ''}`;
  const seedKey = args.seed
    ? `${args.seed.type}:${args.seed.account_id}:${args.seed.type === 'transfer' ? args.seed.to_account_id ?? '' : ''}`
    : null;

  const [state, setState] = useState<State>({ key: '', rateText: null, receivedText: null, lastEdited: null });
  const current: State =
    state.key === key
      ? state
      : seedKey === key && args.seed?.receivedText
        ? { key, rateText: null, receivedText: args.seed.receivedText, lastEdited: 'received' }
        : { key, rateText: null, receivedText: null, lastEdited: null };

  const entered = parse(args.entered);
  const defaultRate = mode === 'spend' ? avgRate ?? marketRate ?? 1 : marketRate ?? avgRate ?? 1;

  let rate = defaultRate;
  let received = 0;
  const typedReceived = parse(current.receivedText);
  if (mode === 'convert_in' || mode === 'convert_out') {
    if (current.lastEdited === 'received' && typedReceived > 0) {
      received = typedReceived;
      if (entered > 0) rate = mode === 'convert_in' ? entered / received : received / entered;
    } else {
      const typedRate = parse(current.rateText);
      if (current.lastEdited === 'rate' && typedRate > 0) rate = typedRate;
      received = entered > 0 ? roundTo(mode === 'convert_in' ? entered / rate : entered * rate) : 0;
    }
  } else if (mode === 'spend') {
    rate = avgRate ?? defaultRate;
  }

  const legs = resolveLegs({ mode, entered, rate, received: received || null });

  // What the subaccount's average becomes once this conversion lands.
  let averageAfter: number | null = null;
  if (mode === 'convert_in' && foreignAccount && legs.foreign_amount) {
    const held = Math.max(0, Number(foreignAccount.native_balance ?? 0));
    const avg = avgRate ?? rate;
    const units = held + legs.foreign_amount;
    if (units > 0) averageAfter = (held * avg + legs.amount) / units;
  }

  return {
    mode,
    base,
    currency,
    foreignAccount,
    /** Currency of the amount the user types. */
    enteredCurrency: mode === 'spend' || mode === 'convert_out' ? (currency as string) : base,
    /** Currency of the "you receive" figure. */
    receivedCurrency: mode === 'convert_in' ? (currency as string) : base,
    rate,
    marketRate,
    avgRate,
    averageAfter,
    receivedValue:
      current.lastEdited === 'received' ? current.receivedText ?? '' : received > 0 ? String(received) : '',
    rateValue: current.lastEdited === 'rate' ? current.rateText ?? '' : trimRate(rate),
    setReceived: (v: string) => setState({ key, rateText: null, receivedText: v, lastEdited: 'received' }),
    setRate: (v: string) => setState({ key, rateText: v, receivedText: null, lastEdited: 'rate' }),
    useMarketRate: () =>
      marketRate && setState({ key, rateText: trimRate(marketRate), receivedText: null, lastEdited: 'rate' }),
    legs,
    blocked: mode === 'unsupported',
  };
}

export type ForeignLeg = ReturnType<typeof useForeignLeg>;
