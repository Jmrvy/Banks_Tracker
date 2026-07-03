# Application Audit — Reports Generation Engine & Date Handling

> **Date:** 2026-07-03
> **Scope:** Full application review with a deep dive into the reports engine
> (`useReportsData`, Reports page, ReportWizard PDF/Excel export, `buildReportData`)
> and its handling of **accounting date** (`transaction_date`) vs **value date** (`value_date`).
>
> **Verdict:** The suspicion is correct. The engine does *not* handle the two date
> types consistently. Five confirmed correctness bugs (2 high severity), plus a
> systemic root cause: the "which date do I use?" logic is re-implemented in at
> least 8 places and they have drifted apart.
>
> **Status (2026-07-03):** Phase 1 is implemented on this branch — BUG-1 through
> BUG-5 and C-1/C-2 are fixed, the shared `getTxDate`/`normalizePeriod` utilities
> replace all duplicated date-resolution sites, and `src/lib/dateUtils.test.ts`
> adds regression coverage (incl. the noon-boundary case). Phases 2–3 remain open.

---

## 1. Confirmed bugs — date handling in the reports engine

### BUG-1 (HIGH) — Custom periods silently drop all transactions on the first day

Custom date pickers normalize the picked day to **12:00 noon** to avoid timezone
shifts when serializing:

- `src/components/reports/PeriodSelector.tsx:31-35` — `fixTimezone()` → `new Date(y, m, d, 12, 0, 0, 0)`
- `src/components/dashboard/DashboardHeader.tsx:58-59` — same helper
- `src/components/ReportWizard.tsx:722` and `:742` — inline `new Date(y, m, d, 12)`

But every transaction date is parsed to **local midnight** via `parseLocalDate()`
(`src/lib/dateUtils.ts`). Period filtering then does:

```ts
// src/hooks/useReportsData.ts:186
isWithinInterval(dateToUse, { start: period.from, end: period.to })
```

A transaction dated on the custom range's first day is `00:00 < 12:00` → **excluded**
from stats, category totals, income analysis, the balance chart, the PDF/Excel
export, and the dashboard KPIs (StatsCards uses `d >= startDate`, same problem —
`src/components/dashboard/StatsCards.tsx:109-112`).

The end boundary happens to work (`00:00 ≤ 12:00`), so only the **start day** is
lost — which makes this bug subtle: totals are just "a bit off", exactly the kind
of unexplained discrepancy that erodes trust in the reports.

**Fix:** normalize inside the engine — `startOfDay(period.from)` / `endOfDay(period.to)`
at the point of consumption, so no picker quirk can ever drop a boundary day.

---

### BUG-2 (HIGH) — Balance evolution chart mixes value-date filtering with accounting-date positioning

`src/hooks/useReportsData.ts:367-423` (`balanceEvolutionData`):

- Input is `filteredTransactions` — filtered by the **active date type** (possibly `value`).
- But grouping/positioning always uses `transaction_date` (accounting), per the
  comment at line 366/369.
- Meanwhile the starting balance (`initialBalance`, lines 192-229) *is* computed
  with the **active date type**.

Consequences when the user selects *value date*:

1. A transaction whose `value_date` is inside the period but whose
   `transaction_date` is **before** `period.from` produces a chart point *before*
   the chart's start point — and since the start point is pushed first (line 383)
   and transaction dates are appended after it, the x-axis sequence goes
   **backwards in time** (visual glitch, wrong running balance at the start).
2. Symmetrically, transactions accounting-dated **after** `period.to` extend the
   chart beyond the period.
3. The baseline (value-date semantics) and the day buckets (accounting semantics)
   describe two different timelines, so intermediate balances are simply wrong
   whenever the two dates straddle a period boundary.

Additionally the chart's daily delta (lines 406-410) uses **raw amounts** and
ignores `include_in_stats` and refund netting, while the `finalBalance` shown in
the hero (`stats`, lines 232-265) filters both — so the last chart point does not
reconcile with the displayed final balance whenever excluded/refunded
transactions exist in the period.

**Fix:** one timeline per rendering — position by the *same* active date type used
for filtering (the baseline already uses it), and decide explicitly whether the
chart tracks the *real* balance (keep everything, current baseline behaviour) or
the *stats* balance (apply `include_in_stats` + refund netting everywhere) — then
apply that choice to baseline, deltas and headline consistently.

---

### BUG-3 (MEDIUM) — Ledger running balance ignores transfer fees (PDF + Excel)

- `src/components/report/buildReportData.ts:483` — ledger rows: `signed = 0` for
  transfers, so `transfer_fee` is never subtracted.
- `src/components/ReportWizard.tsx:502-505` — Excel "Transactions" sheet: same
  omission, and transfer rows display `amount` as a positive figure with no
  effect on the running balance column.

`stats.netPeriodBalance` *does* subtract transfer fees
(`useReportsData.ts:251-255`), so the ledger's closing row disagrees with the
"Solde final" on the summary page/sheet of the same document whenever any
transfer with a fee falls in the period. The ledger also includes
`include_in_stats = false` rows and refund incomes at full value while the
summary nets them — a second source of drift within one exported report.

---

### BUG-4 (MEDIUM) — PDF month-over-month comparison uses different rules than the current period

`src/components/report/buildReportData.ts:186-205`:

- Prior period is derived by **millisecond span arithmetic** (`prevEnd = start - 1ms`,
  `prevStart = prevEnd - spanMs`) instead of calendar months. For a 31-day month
  it compares against a 31-day window that misaligns with the previous calendar
  month, and it's DST-fragile. The on-screen engine does this correctly with
  `subMonths`/`startOfMonth` (`useReportsData.ts:290-307`) — so the PDF MoM
  numbers don't match the on-screen "vs prior period" numbers.
- `prevExpenses` uses **gross** amounts (line 197) while the current period uses
  refund-netted expenses (`stats.expenses`) — the % change compares apples to oranges.
- Transfer fees are excluded from `prevNet` but included in `netResult`.

**Fix:** reuse the hook's `computeStatsForRange` + `priorPeriod` (or pass
`priorStats` into `buildReportData`) instead of re-deriving.

---

### BUG-5 (MEDIUM) — `formatDate` preference is timezone-unsafe

`src/hooks/useUserPreferences.ts:108-121`:

- `new Date('YYYY-MM-DD')` parses as **UTC midnight** — displays the *previous
  day* in any UTC-negative timezone.
- The `'YYYY-MM-DD'` output branch uses `toISOString()`, which converts a
  local-midnight `Date` (everything built via `parseLocalDate`) back to UTC —
  shifting it to the *previous day* for UTC-positive timezones, i.e. **for the
  app's primary French audience**.

**Fix:** parse with `parseLocalDate`, format with `date-fns format` — never
`toISOString()` for calendar dates.

---

## 2. Consistency findings (not wrong in isolation, but incoherent together)

| # | Finding | Where |
|---|---------|-------|
| C-1 | **ReportWizard ignores the user's dateType preference** — hardcoded `dateType: 'accounting'` default, while the Reports page initializes from `userPreferences`. Exporting "the same period I'm looking at" can produce different numbers. | `ReportWizard.tsx:138` vs `Reports.tsx:41-50` |
| C-2 | **Reports.tsx reads localStorage directly** to seed dateType instead of using `useUserPreferences()` (which now has a proper module store). Duplicated parsing, no reactivity to Settings changes. | `Reports.tsx:41-50` |
| C-3 | **`stats.finalBalance` mixes semantics**: `initialBalance` reverses *all* transactions (real balance), but the period delta excludes `include_in_stats=false` and nets refunds (stats view). The result is neither the real projected balance nor a pure stats figure. | `useReportsData.ts:192-265` |
| C-4 | **Value-date mode balances are approximations by construction**: `accounts.balance` in the DB is mutated at insertion (accounting reality); reversing per value date produces a hybrid. Nowhere documented/surfaced to the user. | `useReportsData.ts:192-229`, `buildReportData.ts:287-332` |
| C-5 | **Occurrences dated today count as "future"** (`current < today`), so "past vs upcoming" splits shift at midnight rather than including today's already-executed recurring items. Defensible, but undocumented. | `useReportsData.ts:684` |
| C-6 | `recurringData` memo lists `transactions`/`activeDateType` as deps without using them → gratuitous recomputes. | `useReportsData.ts:846` |

### Root cause

The expression `dateType === 'value' ? parseLocalDate(t.value_date || t.transaction_date) : parseLocalDate(t.transaction_date)`
is **copy-pasted in at least 8 modules**: `useReportsData` (×4 sites), `Reports.tsx`
(modal sorting), `ReportWizard.tsx` (filtering + evolution + Excel),
`buildReportData.ts` (`txDateOf`), `StatsCards.tsx`, `CashflowChart.tsx`,
`DistributionChart.tsx`, `CommandPalette.tsx`. Each copy independently decides
boundary semantics, `include_in_stats` handling, and refund netting. Drift is
inevitable; BUG-2/3/4 are all instances of it.

---

## 3. Broader application audit (summary)

**Architecture & code quality**
- Clean layering overall (pages / components / hooks / lib), good use of memoized
  derived data and React Query where adopted.
- `useReportsData` is a **1,050-line god-hook with 10 positional parameters** —
  untestable as-is, and the reason export code re-implements pieces of it.
- TypeScript strict mode is off; `scheduledDebtPaymentInfos` is `useState<any[]>`
  (`Reports.tsx:73`). Loosely-typed money/date code is where the above bugs hide.

**Testing**
- Only 2 test files exist (`loanCalculator`, `csvScheduleParser`). **Zero tests**
  cover period filtering, date-type switching, stats, balances, or exports — the
  most arithmetic-dense code in the app. Vitest is already configured.

**i18n**
- The Excel export and parts of the wizard hardcode French strings
  ("Rapport Financier", "Depenses par categorie", "Trimestre"…) — English users
  get a mixed-language document.

**Performance**
- Multiple O(n) full scans of `transactions` per memo (initial balance ×2,
  computeStatsForRange per sparkline point, accountDelta ×2 per account in the
  report builder → O(accounts × transactions)). Fine at personal-finance scale;
  worth a pre-sorted/indexed pass if transaction counts grow past ~10k.

**Security**
- Supabase RLS scoped to `auth.uid()` per CLAUDE.md; anon key in client is
  expected. No findings in the reviewed scope.

---

## 4. Improvement plan

### Phase 1 — Correctness (small, independently shippable fixes)

1. **Single date-resolution utility** — extend `src/lib/dateUtils.ts`:
   ```ts
   export const getTxDate = (t: {transaction_date: string; value_date?: string|null},
                             dateType: 'accounting' | 'value'): Date =>
     parseLocalDate(dateType === 'value' ? (t.value_date || t.transaction_date)
                                         : t.transaction_date);
   export const normalizePeriod = (p: {from: Date; to: Date}) =>
     ({ from: startOfDay(p.from), to: endOfDay(p.to) });
   ```
   Replace all 8 duplicated call sites.
2. **Fix BUG-1**: apply `normalizePeriod` inside `useReportsData` (and StatsCards /
   wizard filtering) so noon-anchored picker dates can never exclude boundary days.
   Keep the noon anchor in pickers (it's a legitimate serialization guard).
3. **Fix BUG-2**: make `balanceEvolutionData` position transactions with
   `getTxDate(t, activeDateType)` — one timeline for filter, baseline and buckets.
   Then reconcile chart deltas with the headline (`include_in_stats` + refund
   netting), or explicitly rename the chart series "real balance".
4. **Fix BUG-3**: in ledger rows and the Excel sheet, `signed = -(transfer_fee)`
   for transfers; align inclusion rules with `stats` or add an explicit
   "excluded from stats" marker column.
5. **Fix BUG-4**: pass `priorStats`/`computeStatsForRange` from the hook into
   `buildReportData`; delete its private prior-period arithmetic.
6. **Fix BUG-5**: rewrite `formatDate` with `parseLocalDate` + `format`.
7. **Fix C-1/C-2**: seed both Reports page and ReportWizard from
   `useUserPreferences().preferences.dateType`.

### Phase 2 — Make the engine testable (structural)

8. **Extract a pure engine**: `src/lib/reportsEngine/` with pure functions —
   `filterByPeriod(txs, period, dateType)`, `computeStats(...)`,
   `computeInitialBalance(...)`, `buildBalanceSeries(...)` — no React, no hooks.
   `useReportsData` becomes a thin memoizing wrapper; `buildReportData` and the
   Excel generator consume the *same* functions instead of re-deriving.
9. **Unit tests (vitest)** for the engine, covering: first/last day of period
   (midnight vs noon inputs), accounting↔value divergence across period
   boundaries, `value_date` null fallback, transfer fees, refund netting,
   `include_in_stats`, leap years / DST transitions, and
   ledger-total ≡ summary-total reconciliation (the invariant BUG-3 broke).
10. **One period source of truth**: share period construction between
    `PeriodContext`, Reports' `PeriodSelector`, and the wizard so boundary
    normalization lives in exactly one place.

### Phase 3 — Semantics & polish

11. **Document and surface value-date semantics**: banner/tooltip explaining that
    account balances are accounting-dated by nature and value-date views
    reallocate flows across period boundaries (the existing
    `ValueDateDifferenceModal` is the right hook for this).
12. **Split "real balance" vs "stats balance"** in `ReportsStats` (two explicit
    fields) so every consumer chooses deliberately (fixes C-3).
13. **i18n the Excel export**; type `scheduledDebtPaymentInfos`; drop unused memo
    deps (C-6); consider enabling `strictNullChecks` for `src/lib` + the new
    engine module first.

### Suggested order & effort

| Step | Effort | Risk | Payoff |
|------|--------|------|--------|
| 1–2 (utility + boundary fix) | ~½ day | Low | Kills the silent day-one data loss everywhere |
| 3 (evolution chart) | ~½ day | Medium (visual change) | Chart finally correct in value mode |
| 4–7 | ~1 day | Low | Exports reconcile internally & with the screen |
| 8–10 | 2–3 days | Medium (refactor) | Regression safety for all future report work |
| 11–13 | 1–2 days | Low | UX clarity + long-term hygiene |
