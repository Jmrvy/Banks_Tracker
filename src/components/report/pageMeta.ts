/* Shared page model for the v2 statement-style report wizard.
 * Single source of truth for the wizard UI, the contents page, and
 * the PDF orchestrator. */

export type ReportSection =
  | 'summary'
  | 'accounts'
  | 'transactions'
  | 'categories'
  | 'income'
  | 'budgets'
  | 'evolution'
  | 'recurring';

export type PageId =
  | 'cover'
  | 'contents'
  | 'summary'
  | 'cashflow'
  | 'categories'
  | 'budgets'
  | 'accounts'
  | 'income'
  | 'recurring'
  | 'transactions';

export interface PageEntry {
  id: PageId;
  enabled: boolean;
}

/** Translate a page id into the legacy ReportSection key. Cover and
 *  Contents return null — they're chrome, not data sections. */
export const PAGE_TO_SECTION: Record<PageId, ReportSection | null> = {
  cover: null,
  contents: null,
  summary: 'summary',
  cashflow: 'evolution',
  categories: 'categories',
  budgets: 'budgets',
  accounts: 'accounts',
  income: 'income',
  recurring: 'recurring',
  transactions: 'transactions',
};

export interface PageDef {
  /** Display number shown in the rail (e.g. "01", "10+"). */
  num: string;
  labelKey: string;
  labelDefault: string;
  metaKey: string;
  metaDefault: string;
  /** Cover is always on. */
  required?: boolean;
  /** Multi-page (ledger): hint shown in meta. */
  multiPage?: boolean;
}

export const PAGE_DEFS: Record<PageId, PageDef> = {
  cover:        { num: '01',  labelKey: 'reports.page.cover.label',        labelDefault: 'Cover & key figures',          metaKey: 'reports.page.cover.meta',        metaDefault: '1 page · auto-generated', required: true },
  contents:     { num: '02',  labelKey: 'reports.page.contents.label',     labelDefault: 'Contents',                     metaKey: 'reports.page.contents.meta',     metaDefault: '1 page · navigable in PDF' },
  summary:      { num: '03',  labelKey: 'reports.page.summary.label',      labelDefault: 'Executive summary',            metaKey: 'reports.page.summary.meta',      metaDefault: '1 page · KPIs + verdict' },
  cashflow:     { num: '04',  labelKey: 'reports.page.cashflow.label',     labelDefault: 'Cash flow',                    metaKey: 'reports.page.cashflow.meta',     metaDefault: '1 page · daily in / out' },
  categories:   { num: '05',  labelKey: 'reports.page.categories.label',   labelDefault: 'By category',                  metaKey: 'reports.page.categories.meta',   metaDefault: '1 page · all categories' },
  budgets:      { num: '06',  labelKey: 'reports.page.budgets.label',      labelDefault: 'Budgets vs actual',            metaKey: 'reports.page.budgets.meta',      metaDefault: '1 page · breaches highlighted' },
  accounts:     { num: '07',  labelKey: 'reports.page.accounts.label',     labelDefault: 'Accounts',                     metaKey: 'reports.page.accounts.meta',     metaDefault: '1 page · per-account flow' },
  income:       { num: '08',  labelKey: 'reports.page.income.label',       labelDefault: 'Income sources',               metaKey: 'reports.page.income.meta',       metaDefault: '1 page · breakdown' },
  recurring:    { num: '09',  labelKey: 'reports.page.recurring.label',    labelDefault: 'Recurring & subscriptions',    metaKey: 'reports.page.recurring.meta',    metaDefault: '1 page · active subs' },
  transactions: { num: '10+', labelKey: 'reports.page.transactions.label', labelDefault: 'Transactions ledger',          metaKey: 'reports.page.transactions.meta', metaDefault: 'multi-page ledger', multiPage: true },
};

/** Default ordering matches the statement flow specified in the v2
 *  design: chrome → summary → flow → category drilldown → budget →
 *  accounts → income → recurring → ledger. */
export const DEFAULT_PAGE_ORDER: PageId[] = [
  'cover', 'contents', 'summary', 'cashflow', 'categories',
  'budgets', 'accounts', 'income', 'recurring', 'transactions',
];

export type PresetId = 'standard' | 'detailed' | 'taxReady' | 'receipts';

/** Each preset is the set of pages that should be ON when picked.
 *  Cover is always included since it's required. */
export const PRESETS: Record<PresetId, PageId[]> = {
  standard: ['cover', 'contents', 'summary', 'categories', 'accounts', 'transactions'],
  detailed: ['cover', 'contents', 'summary', 'cashflow', 'categories', 'budgets', 'accounts', 'income', 'recurring', 'transactions'],
  taxReady: ['cover', 'contents', 'summary', 'income', 'transactions'],
  receipts: ['cover', 'transactions'],
};
