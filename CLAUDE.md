# Banks Tracker - Project Reference

> Personal finance management PWA built with React + Supabase.
> **Last updated:** 2026-07-03

---

## Quick Start

```bash
npm install    # or bun install
npm run dev    # Vite dev server on localhost:8080
npm run build  # Production build to dist/
```

---

## Tech Stack

| Layer            | Technology                                        |
| ---------------- | ------------------------------------------------- |
| Framework        | React 18.3 + TypeScript 5.8                       |
| Routing          | React Router 7.13                                 |
| Styling          | Tailwind CSS 3.4 + shadcn/ui (Radix primitives)   |
| Icons            | Lucide React                                      |
| Charts           | Recharts 2.15                                     |
| Forms            | React Hook Form 7.61 + Zod 3.25                   |
| State            | React Context + TanStack React Query 5.83          |
| Backend          | Supabase (PostgreSQL + Auth + Realtime)            |
| i18n             | i18next (fr, en)                                  |
| PWA              | vite-plugin-pwa + Workbox                         |
| AI               | HuggingFace Transformers (income categorization)  |
| Export           | jsPDF + jspdf-autotable, xlsx, html2canvas         |
| Build            | Vite 5.4 + SWC                                    |
| Package Manager  | npm / bun                                         |

---

## Project Structure

```
src/
├── main.tsx                         # Entry point + service worker registration
├── App.tsx                          # Router + providers (Auth, Query, Theme, Period, Privacy)
├── index.css                        # Global Tailwind styles
│
├── pages/                           # 17 page files (all lazy-loaded routes)
│   ├── Index.tsx                    # Dashboard (QuickPreview or full dashboard)
│   ├── Auth.tsx                     # Sign in / Sign up
│   ├── Onboarding.tsx              # First-time user setup wizard
│   ├── Accounts.tsx                 # Account management & details
│   ├── Transactions.tsx             # Transaction history + filters
│   ├── NewTransaction.tsx           # Create transaction page
│   ├── Scheduled.tsx                # Scheduled hub: subscriptions / plans / loans tabs
│   ├── RecurringTransactions.tsx     # Recurring transactions (embedded in Scheduled)
│   ├── InstallmentPayments.tsx      # Installment plans (embedded in Scheduled)
│   ├── InstallmentPaymentDetail.tsx # Single installment plan detail (/installment-payments/:id)
│   ├── Debts.tsx                    # Debt/loan tracking (embedded in Scheduled)
│   ├── Budget.tsx                   # Category budgets + special (event/trip) budgets
│   ├── Savings.tsx                  # Savings goals
│   ├── Reports.tsx                  # Financial analysis (/analyse)
│   ├── Settings.tsx                 # User preferences & management
│   ├── Install.tsx                  # PWA install prompt (NOT routed — orphaned)
│   └── NotFound.tsx                 # 404
│
├── components/                      # ~130 components
│   ├── ui/                          # 60+ shadcn/ui primitives (button, dialog, card, etc.)
│   ├── dashboard/                   # StatsCards, CashflowChart, DistributionChart, etc.
│   ├── reports/                     # EvolutionTab, CategoriesTab, RecurringTab, IncomeTab, etc.
│   ├── settings/                    # ProfileSection, PreferencesSection, etc.
│   ├── charts/                      # BudgetEvolutionChart, CategoryCumulativeChart
│   ├── *Modal.tsx                   # 25+ modal components (New*, Edit*, Detail, etc.)
│   ├── AppSidebar.tsx               # Desktop sidebar navigation
│   ├── MobileNavigation.tsx         # Bottom nav bar (mobile)
│   ├── MobileHeader.tsx             # Top header (mobile)
│   ├── QuickPreview.tsx             # Quick dashboard summary on login
│   ├── ThemeProvider.tsx            # Dark/light mode
│   ├── ErrorBoundary.tsx            # Error handling wrapper
│   ├── OfflineIndicator.tsx         # Offline status banner
│   └── ...                          # AccountCards, DebtCard, LoanCalculator, etc.
│
├── contexts/
│   ├── AuthContext.tsx              # User auth state (Supabase session)
│   ├── PeriodContext.tsx            # Date period selection (1m, 3m, ytd, 1y, custom)
│   ├── PrivacyContext.tsx           # Privacy mode (hide amounts)
│   ├── CommandPaletteContext.tsx    # Cmd-K palette open state / actions
│   └── TourContext.tsx              # Guided product tour state
│
├── hooks/
│   ├── useFinancialData.ts          # Core provider hook: accounts, transactions, categories, recurring CRUD + realtime (debounced)
│   ├── useDebts.ts                  # Debt CRUD + payments + realtime
│   ├── useInstallmentPayments.ts    # Installment payment management + realtime
│   ├── useSavingsGoals.ts           # Savings goals (React Query)
│   ├── useSpecialBudgets.ts         # Special (event/trip) budget envelopes
│   ├── useReportsData.ts            # Reports view-model (thin wrapper over lib/reportsEngine)
│   ├── useAccountSeries.ts          # Per-account balance time series
│   ├── useIncomeAnalysis.ts         # AI income categorization
│   ├── useUserPreferences.ts        # localStorage preferences (module store + subscribe)
│   ├── useDateFnsLocale.ts          # date-fns locale from i18n language
│   ├── useOnboarding.ts             # First-time setup flag
│   ├── useOffline.ts                # Online/offline detection
│   ├── useOfflineQueue.ts           # Offline sync queue
│   ├── use-mobile.tsx               # Mobile breakpoint (< 768px)
│   └── use-toast.ts                 # Toast notifications
│
├── integrations/supabase/
│   ├── client.ts                    # Supabase client init
│   └── types.ts                     # Auto-generated DB types (~1170 lines)
│
├── lib/
│   ├── reportsEngine.ts             # PURE reports engine: period filtering, stats, balances (unit-tested; shared by hook + PDF + Excel)
│   ├── periodUtils.ts               # Period construction + prior-period ranges (unit-tested)
│   ├── dateUtils.ts                 # parseLocalDate / getTxDate (accounting vs value) / normalizePeriod (unit-tested)
│   ├── transactionMath.ts           # Transaction amount helpers
│   ├── specialBudgetUtils.ts        # Special-budget period summaries
│   ├── recurringAmount.ts           # Effective recurring amounts
│   ├── recurringCalendarMonth.ts    # Recurring calendar month model
│   ├── projectMonthEndBalance.ts    # Month-end balance projection
│   ├── searchQuery.ts               # Command-palette query parsing
│   ├── categoryIcons.ts / chartConfig.ts
│   ├── constants.ts                 # Bank labels, account types, currencies, colors
│   ├── currency.ts                  # Currency formatting helpers
│   ├── utils.ts                     # cn() and general utilities
│   └── validations.ts              # Zod schemas for forms
│
├── config/
│   └── navigation.ts               # Sidebar/mobile nav config
│
├── utils/
│   ├── loanCalculator.ts           # Loan amortization math (unit-tested)
│   ├── csvScheduleParser.ts        # CSV payment-schedule import (unit-tested)
│   ├── debtUtils.ts                # Debt helpers
│   └── namePlaceholders.ts         # {MM}/{YYYY}-style description interpolation
│
└── i18n/
    ├── index.ts                     # i18next setup
    └── locales/
        ├── fr.json                  # French translations (primary)
        └── en.json                  # English translations
```

---

## Database Schema (Supabase PostgreSQL)

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **profiles** | User profiles | id (FK→auth.users), full_name |
| **accounts** | Bank accounts | user_id, name, bank, account_type (checking/savings/credit/investment), balance |
| **transactions** | All transactions | user_id, account_id, amount, type (income/expense/transfer), description, transaction_date, value_date, category_id, transfer_to_account_id, transfer_fee, include_in_stats, refund_of_transaction_id, refunded_amount, special_budget_id |
| **categories** | Spending categories | user_id, name, color, budget (optional monthly limit) |
| **transaction_categories** | Multi-category junction | transaction_id, category_id, user_id |
| **special_budgets** | Event/trip budget envelopes (outside category budgets) | user_id, name, total_budget, status (active/closed), start_date, end_date, savings_goal_id, color, icon |

### Recurring & Installments

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **recurring_transactions** | Scheduled transactions | recurrence_type (daily/weekly/monthly/quarterly/yearly), start_date, end_date, next_due_date, is_active |
| **installment_payments** | Payment plans | total_amount, remaining_amount, installment_amount, frequency, payment_type (reimbursement/payment) |
| **installment_payment_records** | Individual installment records | installment_payment_id, amount, payment_date, is_paid, transaction_id |
| **installment_payment_history** | Audit trail | change_type, old_values, new_values, change_description |

### Debts & Savings

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **debts** | Loans given/received | type (loan_given/loan_received), total_amount, remaining_amount, interest_rate, status (active/completed/defaulted), contact_name |
| **debt_payments** | Debt payment records | debt_id, amount, payment_date |
| **scheduled_debt_payments** | Planned debt payments | debt_id, scheduled_date, scheduled_amount, is_paid |
| **savings_goals** | Savings targets | name, target_amount, current_amount, target_date, category, color |

### System

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **notification_preferences** | User notification config | budget_alerts, monthly_reports |
| **notification_logs** | Notification audit | notification_type, status, category_id, alert_month |
| **balance_recalculation_history** | Audit trail of balance recomputes | account_id, old/new balance, reason |

### Database Functions (RPC)

| Function | Purpose |
|----------|---------|
| `get_account_balance_at_date` | Account balance as of a given date |
| `recalculate_account_balances` | Rebuild balances from the transaction ledger |
| `get_account_deletion_impact` / `delete_account_cascade` | Preview + perform cascading account deletion |

All 17 public tables have **RLS enabled**, scoped to `auth.uid()`. Schema is
managed via `supabase/migrations/` (64 migrations); regenerate
`src/integrations/supabase/types.ts` after any migration.

---

## Edge Functions (supabase/functions/)

| Function | Kind | Purpose |
|----------|------|---------|
| `api-auth` | External API | POST email+password → ~1h session token for the read API below |
| `get-summary` | External API | One-shot period summary (balances, income/expenses, top categories, monthly breakdown) |
| `get-accounts` / `get-categories` / `get-recurring` | External API | Read endpoints for accounts, categories, recurring transactions |
| `get-investment-transactions` | External API | Returns ALL transactions, filtered (historical name kept for backward compat) |
| `process-recurring-transactions` | Scheduled job | Materializes due recurring transactions |
| `check-budgets` | Scheduled job | Budget-threshold alerts |
| `send-monthly-reports` | Scheduled job | Emails a monthly PDF report (own Deno-side PDF renderer — does NOT share src/lib/reportsEngine; keep rules in sync manually) |
| `send-notification-email` | Utility | Email delivery |

---

## Authentication

- **Provider:** Supabase Auth (email/password)
- **Session:** JWT stored in localStorage, auto-refresh enabled
- **Row Level Security:** All tables use RLS policies scoped to `auth.uid()`
- **Password rules:** 8+ chars, uppercase, lowercase, digit

---

## Local Storage Keys

| Key | Purpose |
|-----|---------|
| `userPreferences` | `{ currency, dateFormat, enableNotifications, dateType, accountAliases, quickPreviewOnLogin }` |
| `privacyMode` | Boolean - hide amounts |
| `i18nextLng` | Language code (fr/en) |
| `budget-app-onboarding-done` | Onboarding completed flag |
| `budget-app-needs-onboarding` | Post-signup onboarding trigger |
| `offline-queue` | Pending writes queued while offline |

---

## Routes

| Path | Page | Auth Required |
|------|------|:---:|
| `/` | Dashboard | Yes |
| `/auth` | Sign in / Sign up | No |
| `/onboarding` | First-time setup | Yes |
| `/accounts` | Account management | Yes |
| `/transactions` | Transaction history | Yes |
| `/new-transaction` | Create transaction | Yes |
| `/scheduled` | Scheduled hub (`?tab=` subscriptions / plans / loans) | Yes |
| `/recurring-transactions` | Recurring transactions | Yes |
| `/installment-payments` | Installment payments | Yes |
| `/installment-payments/:id` | Installment plan detail | Yes |
| `/debts` | Redirect → `/scheduled?tab=loans` | Yes |
| `/budget` | Category + special budgets | Yes |
| `/savings` | Savings goals | Yes |
| `/analyse` | Financial analysis & reports (formerly `/reports`) | Yes |
| `/settings` | User settings | Yes |

---

## Features Summary

### Core
- Multi-account tracking (checking, savings, credit, investment) across 9+ French banks
- Full transaction CRUD with income/expense/transfer types
- Multi-category support per transaction
- Refund linking (track refunds against original transactions)
- Transfer fees tracking
- Accounting date vs value date differentiation

### Recurring & Planning
- Recurring transactions (daily/weekly/monthly/quarterly/yearly)
- Calendar view with occurrence preview
- Installment payment plans with progress tracking
- Plan adjustment mid-stream
- Auto-link to recurring transactions

### Debt Management
- Loans given/received tracking
- Interest rate & amortization schedule
- Scheduled payments with reminders
- Loan calculator tool
- Contact info storage

### Savings
- Goal creation with target amounts & dates
- Progress tracking with visual indicators
- Category & color coding

### Budgets
- Category budgets with alerts and period-scaled comparison
- Special (event/trip) budget envelopes with tagged transactions, kept outside category budgets

### Reports & Analytics
- Financial analysis page (`/analyse`): hero stats + Over time / Flows / What's coming tabs
- Accounting vs value date convention toggle (with explanatory tooltip); include-upcoming projections
- Comparison vs prior period / 3-month average / same period last year
- Balance evolution with recurring-based projection
- Category spending breakdown with budget comparison; income source analysis
- Period selection (month / year / custom) — dashboard uses 1m / 3m / YTD / 1y
- Statement-style PDF (page-based wizard with presets, forecast entries) & Excel export (i18n fr/en)
- Pure calculation engine in `src/lib/reportsEngine.ts` + `periodUtils.ts` + `dateUtils.ts`, shared by screen/PDF/Excel and unit-tested (`npm run test`) — see `docs/REPORTS_ENGINE_AUDIT.md`

### UX & Platform
- PWA with offline support & sync queue
- Dark/light theme
- Privacy mode (hide amounts)
- French & English localization
- Mobile-first responsive design
- Command palette (Cmd-K) with query syntax
- Guided product tour
- Quick Preview dashboard splash (opt-in via Settings, off by default)
- Interactive onboarding wizard
- AI income categorization (HuggingFace)

---

## Update Tracker

| Date | Changes |
|------|---------|
| 2026-07-03 | Doc refresh: routes (/analyse, /scheduled, /budget, /installment-payments/:id, /debts redirect), pages/hooks/contexts/lib trees, schema (special_budgets, balance_recalculation_history, RPC functions), edge-functions section, localStorage keys — verified against live Supabase schema (17 tables, RLS on) |
| 2026-07-03 | Reports engine overhaul: date-type fixes (noon-boundary, one-timeline evolution chart, transfer fees in running balances, calendar-aware PDF comparison, timezone-safe formatDate) + pure engine extracted to src/lib/reportsEngine.ts shared by hook/PDF/Excel, unit-tested; Excel export i18n (fr/en); ReportsStats gains realNetChange/realFinalBalance (see docs/REPORTS_ENGINE_AUDIT.md) |
| 2026-03-11 | Full UX polish: liquid glass morphism, consistent rounded-xl/2xl borders, entrance animations across all components |
| 2026-03-11 | Improved mobile stat cards: larger text (text-base), visible icons on all screens, better touch targets (44px min) |
| 2026-03-11 | Enhanced UI primitives: buttons, dialogs, alerts, tabs, badges, inputs, selects with glass effects |
| 2026-03-11 | Fixed mobile UX for all 22 modal dialogs (consistent DialogContent styling) |
| 2026-03-11 | Fixed mobile UX for installment payment modals |
| 2026-03-11 | Fixed mobile layout for installment payments page |
| 2026-03-11 | Redesigned installment payments page (Klarna-style expandable cards) |
| 2026-03-11 | Fixed installment occurrence limits, calendar click-to-scroll, redesigned list tab |
| 2026-03-11 | Fixed recurring calendar occurrence logic, Klarna-style transaction list |
| 2026-03-11 | Refined UI with glass morphism styling and improved visual hierarchy |
| 2026-03-10 | Added visual UI mockups to onboarding feature guides |
| 2026-03-10 | Added interactive mini-guides for each feature in onboarding |
| 2026-03-10 | Added email notifications and settings guides to onboarding |
| 2026-03-10 | Restricted onboarding to new signups only |
| 2026-03-10 | Quick Preview shown on every login/refresh |

---

## Dev Notes

- **Supabase URL:** `https://cuanladihtpvkmjhvrln.supabase.co`
- **Default language:** French (fr)
- **Mobile breakpoint:** 768px (`use-mobile.tsx`)
- **TypeScript strict mode:** Off (lenient)
- **Path alias:** `@` → `./src`
- **Vite port:** 8080
- **Modal pattern:** All modals use `w-[95vw] sm:max-w-{size} max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0` with inner padding on header/body sections
