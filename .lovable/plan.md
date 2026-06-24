## What we add

### 1. Toggle on the "This month" tile
File: `src/components/RecurringMonthlySummary.tsx`

Add a small segmented control at the top of the tile:
- **Moyenne mensuelle** (current behavior — yearly/12, quarterly/3, etc.)
- **Réel ce mois-ci** — sum of occurrences that actually fall inside the current calendar month, using each rule's `start_date` / `end_date` / `next_due_date` / `recurrence_type`.

Both totals, the "active charges" line, the colored bar, and the "By category" breakdown all recompute from the active mode so the tile is internally consistent.

To match the calendar's `1 443,41 €` exactly, the "Réel" walker uses the same per-occurrence amount resolution as the calendar:
- installment-linked → `installment_amount`
- debt-linked → `scheduled_debt_payments.scheduled_amount` for the month, else `debt.payment_amount`
- otherwise → `rt.amount`

This already exists in `src/lib/recurringAmount.ts` (`getRecurringDisplayAmount`). The component pulls `installmentPayments`, `debts`, `scheduledDebtPayments` from their existing hooks (`useInstallmentPayments`, `useDebts`) — same data the page already loads, so no extra fetch.

The toggle state is local (no persistence) and defaults to **Réel ce mois-ci** since that's what users expect to reconcile with the calendar.

### 2. Year view on the recurring calendar
File: `src/components/RecurringCalendar.tsx`

Add a view-mode segmented control next to the month nav:
- **Mois** (current daily grid — unchanged)
- **Année**

In Année mode:
- Header shows the year with prev/next year buttons.
- A 4×3 grid of 12 month tiles. Each tile shows:
  - Month name
  - Net total for that month (green/red), plus a thin stacked bar of income vs expense.
  - Small count of occurrences.
- Today's month is highlighted.
- Clicking a month switches back to **Mois** view focused on that month.

The year total is computed by reusing the existing `transactionsByDay` logic, generalized to walk the 12 months of the active year. We extract the current per-month aggregation into a small helper so both views consume the same builder — guarantees the same numbers as the daily view.

The list below (Upcoming / Past sections) keeps showing the focused month, which is the currently selected month in either mode.

## Technical notes
- No schema or data changes.
- No new dependencies.
- Both changes are presentation-only and live in the two files listed above (plus minor imports).
- `RecurringMonthlySummary` becomes a client of `useInstallmentPayments` and `useDebts` — both are already mounted on this page, so it's a duplicate hook call only when the component is used elsewhere (currently it isn't).
