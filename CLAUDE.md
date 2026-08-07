# Banks Tracker - Project Reference

> Personal finance management PWA built with React + Supabase.
> **Last updated:** 2026-08-07

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
├── pages/                           # 14 route pages
│   ├── Index.tsx                    # Dashboard (QuickPreview or full dashboard)
│   ├── Auth.tsx                     # Sign in / Sign up
│   ├── Onboarding.tsx              # First-time user setup wizard
│   ├── Accounts.tsx                 # Account management & details
│   ├── Transactions.tsx             # Transaction history + filters
│   ├── NewTransaction.tsx           # Create transaction page
│   ├── RecurringTransactions.tsx     # Recurring transaction management
│   ├── InstallmentPayments.tsx      # Installment payment tracking
│   ├── Debts.tsx                    # Debt/loan tracking
│   ├── Savings.tsx                  # Savings goals
│   ├── Reports.tsx                  # Financial reports & analytics
│   ├── Settings.tsx                 # User preferences & management
│   ├── Install.tsx                  # PWA installation prompt
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
│   └── PrivacyContext.tsx           # Privacy mode (hide amounts)
│
├── hooks/
│   ├── useFinancialData.ts          # Core hook: accounts, transactions, categories CRUD
│   ├── useDebts.ts                  # Debt CRUD + payments
│   ├── useInstallmentPayments.ts    # Installment payment management
│   ├── useSavingsGoals.ts           # Savings goals (React Query)
│   ├── useReportsData.ts            # Report calculations & filtering
│   ├── useIncomeAnalysis.ts         # AI income categorization
│   ├── useUserPreferences.ts        # localStorage preferences
│   ├── useOnboarding.ts             # First-time setup flag
│   ├── useOffline.ts                # Online/offline detection
│   ├── useOfflineQueue.ts           # Offline sync queue
│   ├── use-mobile.tsx               # Mobile breakpoint (< 768px)
│   └── use-toast.ts                 # Toast notifications
│
├── integrations/supabase/
│   ├── client.ts                    # Supabase client init
│   └── types.ts                     # Auto-generated DB types (~570 lines)
│
├── lib/
│   ├── constants.ts                 # Bank labels, account types, currencies, colors
│   ├── currency.ts                  # Currency formatting helpers
│   ├── utils.ts                     # cn() and general utilities
│   └── validations.ts              # Zod schemas for forms
│
├── config/
│   └── navigation.ts               # Sidebar/mobile nav config
│
├── utils/
│   └── loanCalculator.ts           # Loan amortization math
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
| **transactions** | All transactions | user_id, account_id, amount, type (income/expense/transfer), description, transaction_date, value_date, category_id, transfer_to_account_id, transfer_fee, include_in_stats |
| **categories** | Spending categories | user_id, name, color, budget (optional monthly limit) |
| **transaction_categories** | Multi-category junction | transaction_id, category_id, user_id |

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
| `userPreferences` | `{ currency, dateFormat, enableNotifications, dateType, accountAliases }` |
| `privacyMode` | Boolean - hide amounts |
| `i18nextLng` | Language code (fr/en) |
| `budget-app-onboarding-done` | Onboarding completed flag |
| `budget-app-needs-onboarding` | Post-signup onboarding trigger |

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
| `/recurring-transactions` | Recurring transactions | Yes |
| `/installment-payments` | Installment payments | Yes |
| `/debts` | Debt tracking | Yes |
| `/savings` | Savings goals | Yes |
| `/reports` | Reports & analytics | Yes |
| `/trace` | Trace copilot | Yes |
| `/settings` | User settings | Yes |
| `/install` | PWA install prompt | Yes |

---

## Features Summary

### Core
- Multi-account tracking (checking, savings, credit, investment) across 9+ French banks
- Full transaction CRUD with income/expense/transfer types
- Multi-category support per transaction
- Refund linking (track refunds against original transactions)
- Transfer fees tracking
- Accounting date vs value date differentiation
- Category budgets with alerts

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

### Reports & Analytics
- Balance evolution over time
- Category spending breakdown with budget comparison
- Recurring transaction analysis
- Income source analysis
- Savings goal progress
- Period selection (1m, 3m, YTD, 1y, custom)
- PDF & Excel export
- Report wizard for custom reports

### UX & Platform
- PWA with offline support & sync queue
- Dark/light theme
- Privacy mode (hide amounts)
- French & English localization
- Mobile-first responsive design
- Quick Preview dashboard on login
- Interactive onboarding wizard
- AI income categorization (HuggingFace)

---

## Update Tracker

| Date | Changes |
|------|---------|
| 2026-08-07 | Refonte 2026, page layouts — controls move out of stacked full-width bands and into the page head, one band of chrome per page. Analyse: period selector + report button in the head; the net-change hero and its three stacked rows become the deck's four KPI tiles (in / out / net / savings rate) with their own trends; tabs become the compact segmented control with include-upcoming, date-convention and compare-to as chips on the same line. Budget: the period band is gone (presets and pickers in the head, include-projected on the pace chart it governs); the overview reads figure → pace bar with today's tick → verdict in words instead of a ring gauge. Épargne: four KPIs with counts and monthly average as footnotes. Échéancier: each embedded tool posts its primary action into the page header via `ScheduledHeadSlot`. Home: the second sticky header (duplicate breadcrumb + privacy/theme toggles) removed, its period control moved into the head. Settings: the rail now switches sections instead of scroll-anchoring one long page; the tour's three anchors moved onto the rail, gated by breakpoint so the off-screen rail's zero-size rect never captures them. Fixed: the New-transaction amount rendered at 14 px from 768 px up — `md:text-sm` on the input's base class outranks an unprefixed `text-[44px]` |
| 2026-08-04 | Refonte 2026 — warm design system (paper / espresso ink / apricot) replaces the cool-grey-and-green fintech skin. Palette authored in OKLCH, stored as sRGB-equivalent HSL components so all ~270 `hsl(var(--token))` and `hsl(var(--token) / 0.12)` call sites keep working untouched; radius scale (8/11/15/20/28) remapped onto `rounded-sm…3xl` so existing call sites pick up the geometry. Type: Instrument Sans + Instrument Serif (page titles, hero figures, brand marks) + Geist Mono. New shell: breadcrumb topbar (`AppTopbar`), sidebar CTA, centre-FAB mobile tab bar, Trace FAB (opens the existing dock — no third surface). Hero splits net worth into liquid/savings/invested and formats via `splitFormattedAmount`, so the figure follows the user's locale instead of a hard-coded `en-US` `€`. Fixed: `var(--chart-N)`/`var(--primary)` used as bare colours (tokens hold HSL components, so those rendered transparent — the debt-strategy badges had no background) |
| 2026-08-04 | Silent truncation fixed app-wide: `useFinancialData` fetched transactions unbounded, so PostgREST capped it at 1000 and — ordered newest-first — dropped the 33 OLDEST rows from every screen, reports and the opening-balance replay. Now paged on the exact count with `created_at, id` tiebreakers. Trace: `scheduled_charges` had never worked (queried `amount`/`payment_date` on a table rebuilt as `scheduled_amount`/`scheduled_date`, and one shared error check sank the other two legs); `search_transactions` no longer applies the category rule to a period question and returns both figures; `list_uncategorized` honours the date basis and reports the income/expense split; the budget envelope is computed into the prompt context (`budget_envelope.monthly_total`) rather than added up in the answer, after Trace quoted 2 465 € against a real 2 795 €. `npm run check:functions` parses every edge function in CI — an unescaped backtick had left trace-copilot uncompilable on main while the deployed copy still ran |
| 2026-08-04 | Ledger netting rules stated once per runtime: `supabase/functions/_shared/ledgerRules.ts` mirrors `src/lib/reportsEngine.ts` for Deno, and both expose `periodContribution` — the period rule that `computePeriodStats` folds and that per-month / per-category / per-account breakdowns fold too, so a split always sums to the total beside it. Six edge functions moved off their own drifted copies (check-budgets, send-monthly-reports, trace-copilot, get-categories, get-summary, get-investment-transactions, plus the MCP spending summary). Category spend keeps its own rule — it drops special-budget rows, the period rule does not |
| 2026-08-03 | Categories merged to one row per name working in both directions: `kind`, `offsets_category_id` and `wants_income_twin` dropped along with the twin triggers and the kind-enforcement trigger. Income no longer reduces a budget by category — only an explicit refund/repayment link nets, via the expense's `refunded_amount`. Pickers stop filtering by side (`categoryKind.ts` deleted); Budget loses its income panel and offsetting-income line; the savings picker lists each category once instead of twice (ticking one side used to halve the total) |
| 2026-07-30 | Trace copilot: read-only ledger Q&A (`trace-copilot` edge function, OpenRouter + tool calling) answering in a fixed block vocabulary; dock / ⌘K-modal / `/trace` page surfaces; proposals apply client-side under the user's session with an undo log (`trace_activity`); per-user API key, model picker and agency in Settings → Trace copilot |
| 2026-07-30 | Transactional email localized (fr/en) via `_shared/emailI18n.ts` + `notification_preferences.email_language`; CTAs deep-link off `APP_URL`; pace bar renders budget line + today tick; legacy `.glass-*` CSS removed; "Has refund" filter in Transactions |
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
- **Trace copilot:** each user supplies their own OpenRouter key from Settings → Trace copilot; it lives in `trace_credentials` (RLS on, *no policies* — service-role only) and is reachable solely through the `trace-settings` function. `OPENROUTER_API_KEY` / `TRACE_MODEL` / `TRACE_REASONING_EFFORT` on the functions remain a deployment-wide fallback. Must be a tool-calling model — Trace answers by calling an `answer` tool
- **App URL:** `APP_URL` powers the email deep links and OpenRouter's `HTTP-Referer` attribution
- **Modal pattern:** All modals use `w-[95vw] sm:max-w-{size} max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0` with inner padding on header/body sections
