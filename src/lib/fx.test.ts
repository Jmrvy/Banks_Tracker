import { describe, it, expect } from 'vitest';
import { foldForeignLedger, legAmount, type FxTransactionLike } from './fx';

const SUB = { id: 'gbp', currency: 'GBP', initial_balance: 30, initial_fx_rate: 1.2 };
const inbound = (date: string, eur: number, gbp: number): FxTransactionLike => ({
  type: 'transfer', amount: eur, foreign_amount: gbp, account_id: 'eur', transfer_to_account_id: 'gbp', transaction_date: date,
});
const spend = (date: string, gbp: number): FxTransactionLike => ({
  type: 'expense', amount: 0, foreign_amount: gbp, account_id: 'gbp', transaction_date: date,
});

describe('weighted average rate of a currency subaccount', () => {
  it('30 GBP at 1.2 then 70 GBP at 1.3 averages to 1.27', () => {
    const s = foldForeignLedger(SUB, [inbound('2026-11-10', 91, 70)]);
    expect(s.units).toBeCloseTo(100, 6);
    expect(s.rate).toBeCloseTo(1.27, 10);
  });

  it('spending leaves the average where it is', () => {
    const s = foldForeignLedger(SUB, [inbound('2026-11-10', 91, 70), spend('2026-11-12', 10)]);
    expect(s.units).toBeCloseTo(90, 6);
    expect(s.rate).toBeCloseTo(1.27, 10);
  });

  it('a spend before the second conversion is valued at the first rate', () => {
    const txs = [inbound('2026-11-10', 91, 70), spend('2026-11-05', 10)];
    expect(foldForeignLedger(SUB, txs, '2026-11-05').rate).toBeCloseTo(1.2, 10);
    // 20 GBP left at 1.2 (24 €) + 70 at 1.3 (91 €) = 115 € for 90 GBP
    expect(foldForeignLedger(SUB, txs).rate).toBeCloseTo(115 / 90, 10);
  });

  it('converting back to euros keeps the average unchanged', () => {
    const back: FxTransactionLike = {
      type: 'transfer', amount: 40, foreign_amount: 30, account_id: 'gbp', transfer_to_account_id: 'eur', transaction_date: '2026-11-15',
    };
    const s = foldForeignLedger(SUB, [inbound('2026-11-10', 91, 70), back]);
    expect(s.units).toBeCloseTo(70, 6);
    expect(s.rate).toBeCloseTo(1.27, 10);
  });
});

describe('balance legs', () => {
  it('a subaccount moves by its own currency, a main account by euros', () => {
    const tx = { amount: 91, foreign_amount: 70 };
    expect(legAmount(tx, { currency: 'GBP' })).toBe(70);
    expect(legAmount(tx, { currency: null })).toBe(91);
  });
});
