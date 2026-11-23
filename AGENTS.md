# Agent rules

- Currency subaccounts: `transactions.amount` is always base currency (what every statistic sums); `transactions.foreign_amount` is the subaccount-currency leg; `accounts.balance` of a subaccount is stored in its own currency. Server code values accounts only through `supabase/functions/_shared/accountValue.ts` (MCP: `src/lib/mcp/accountValue.ts`), the client through `useFinancialData` — why: adding a raw subaccount balance to base balances silently mixes currencies.
