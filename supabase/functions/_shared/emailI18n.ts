/**
 * Localization for transactional email (budget alerts + periodic reports).
 *
 * The app itself is bilingual, but the emails were French-only: an English
 * user got a French alert. Edge functions can't read the browser's
 * `i18nextLng`, so the language is persisted per user on
 * `notification_preferences.email_language` and threaded through here.
 *
 * Values are plain strings with `{placeholder}` interpolation. Anything
 * user-supplied (category names, account names, descriptions) must still be
 * escaped by the caller — `tr()` does not escape, because most strings are
 * composed into HTML alongside markup.
 */

export type EmailLang = "fr" | "en";

/** Anything unrecognised falls back to French — the app's default locale. */
export function normalizeLang(value: unknown): EmailLang {
  return String(value ?? "").toLowerCase().startsWith("en") ? "en" : "fr";
}

type Dict = Record<string, string>;

const FR: Dict = {
  // ── shared ────────────────────────────────────────────────────────────
  "brand": "Spending Tracker",
  "foot.manage": "Gérer les notifications",
  "foot.unsubscribe": "Se désinscrire",

  // ── budget alert ──────────────────────────────────────────────────────
  "alert.subject": "{category} dépasse le budget — {spent} sur {budget} ({pct} %) · jour {day} sur {days}",
  "alert.preheader": "{category} dépasse le budget de {over} — {spent} sur {budget}",
  "alert.brandTag": "Alerte budget",
  "alert.eyebrow": "Alerte · {month}",
  "alert.title": "{category} dépasse le budget",
  "alert.headline": "{category} dépasse de",
  "alert.sub": "{transactions}, {timeLeft}.",
  "alert.transactions_one": "{count} transaction",
  "alert.transactions_other": "{count} transactions",
  "alert.daysLeft_one": "{count} jour restant dans le mois",
  "alert.daysLeft_other": "{count} jours restants dans le mois",
  "alert.lastDay": "dernier jour du mois",
  "alert.heroLabel": "Dépensé · {category} · {month}",
  "alert.heroSub": "sur {budget} budgétés · {over} au-delà · {transactions}",
  "alert.today": "Aujourd'hui · jour {day} sur {days}",
  "alert.driversTitle": "Ce qui pousse le total",
  "alert.driversCount": "Top {shown} sur {total}",
  "alert.tag.recurring": "Récurrent",
  "alert.cta.open": "Ouvrir {category}",
  "alert.cta.adjust": "Ajuster le budget",
  "alert.cta.mute": "Mettre en pause jusqu'en {month}",
  "alert.foot.mute": "Désactiver pour {category}",
  "alert.foot.note":
    "Une seule alerte par catégorie et par mois. Nous ne vous réécrirons pas au sujet de {category} avant {month}.",

  // ── periodic report ───────────────────────────────────────────────────
  "report.subject": "{period} — net {net} · {rate} % épargnés{breaches}",
  "report.subjectBreaches_one": " · {count} budget dépassé",
  "report.subjectBreaches_other": " · {count} budgets dépassés",
  "report.cadence.weekly": "hebdomadaire",
  "report.cadence.monthly": "mensuel",
  "report.cadence.quarterly": "trimestriel",
  "report.brandTag.weekly": "Rapport hebdomadaire",
  "report.brandTag.monthly": "Rapport mensuel",
  "report.brandTag.quarterly": "Rapport trimestriel",
  "report.title": "Rapport {cadence} — {period}",
  "report.preheader": "{period} · {income} de revenus, {expenses} de dépenses, solde {balance}",
  "report.eyebrow": "Bilan · {period}",
  "report.verdict.saved": "Vous avez mis de côté",
  "report.verdict.overspentPre": "Vous avez dépensé",
  "report.verdict.overspentPost": "de plus que vos revenus.",
  "report.sub": "{transactions} comptabilisées sur la période.",
  "report.transactions_one": "{count} transaction",
  "report.transactions_other": "{count} transactions",
  "report.savingsRate": "Taux d'épargne : {rate} %.",
  "report.stat.income": "Revenus",
  "report.stat.expenses": "Dépenses",
  "report.stat.net": "Net · épargne",
  "report.stat.rate": "Taux {rate} %",
  "report.vsPrev.weekly": "vs semaine préc.",
  "report.vsPrev.monthly": "vs mois préc.",
  "report.vsPrev.quarterly": "vs trimestre préc.",
  "report.breachTitle": "Budgets dépassés",
  "report.breachCount_one": "{count} catégorie",
  "report.breachCount_other": "{count} catégories",
  "report.overTag": "au-dessus",
  "report.categoriesTitle": "Répartition des dépenses",
  "report.categoriesCount": "Top {count}",
  "report.specialTitle": "Budgets spéciaux",
  "report.specialCount_one": "{count} enveloppe",
  "report.specialCount_other": "{count} enveloppes",
  "report.closedTag": "clôturé",
  "report.accountsTitle": "Soldes par compte",
  "report.totalBalance": "Solde total",
  "report.cta.dashboard": "Ouvrir le tableau de bord",
  "report.foot.cadence": "Changer la cadence",
  "report.foot.note":
    "Vous recevez cet email car les rapports {cadence}s sont activés.{pdf} {schedule} · Spending Tracker.",
  "report.foot.pdf": " Rapport PDF en pièce jointe.",
  "report.schedule.weekly": "Envoyé chaque lundi",
  "report.schedule.monthly": "Envoyé le 1er de chaque mois",
  "report.schedule.quarterly": "Envoyé chaque début de trimestre",
  "report.periodLabel.weekly": "Semaine du {date}",

  // ── PDF attachment ────────────────────────────────────────────────────
  // ASCII-only: pdf-lib's standard fonts are WinAnsi-encoded and throw on
  // characters outside it, so these strings stay unaccented by design.
  "pdf.filename": "rapport",
  "pdf.brandTag": "SPENDING TRACKER - RAPPORT",
  "pdf.docType": "RAPPORT",
  "pdf.cover": "Bilan financier",
  "pdf.verdict.saved": "Vous avez mis de cote {amount} EUR.",
  "pdf.verdict.overspent": "Vous avez depense {amount} EUR de plus que vos revenus.",
  "pdf.generated": "GENERE",
  "pdf.transactions": "TRANSACTIONS",
  "pdf.savingsRate": "TAUX D'EPARGNE",
  "pdf.s1": "01 - Vue d'ensemble",
  "pdf.s1sub": "Bilan de la periode",
  "pdf.s2": "02 - Repartition",
  "pdf.s2sub": "Categories",
  "pdf.s3": "03 - Comptes",
  "pdf.s3sub": "Soldes par compte",
  "pdf.s4": "04 - Alertes",
  "pdf.s4sub": "Budgets depasses",
  "pdf.s5": "05 - Enveloppes",
  "pdf.s5sub": "Budgets speciaux",
  "pdf.income": "Revenus",
  "pdf.expenses": "Depenses",
  "pdf.net": "Net de la periode",
  "pdf.totalBalance": "SOLDE TOTAL",
  "pdf.colCategory": "CATEGORIE",
  "pdf.colAmount": "MONTANT",
  "pdf.colShare": "REPARTITION",
  "pdf.colAccount": "COMPTE",
  "pdf.colIncome": "REVENUS",
  "pdf.colExpenses": "DEPENSES",
  "pdf.colBalance": "SOLDE",
  "pdf.overTag": "AU-DESSUS",
  "pdf.closedTag": "CLOTURE",
  "pdf.vsPrev": "vs periode precedente",
};

const EN: Dict = {
  "brand": "Spending Tracker",
  "foot.manage": "Manage alerts",
  "foot.unsubscribe": "Unsubscribe",

  "alert.subject": "{category} is over budget — {spent} of {budget} ({pct}%) · day {day} of {days}",
  "alert.preheader": "{category} is over budget by {over} — {spent} of {budget}",
  "alert.brandTag": "Budget alert",
  "alert.eyebrow": "Alert · {month}",
  "alert.title": "{category} is over budget",
  "alert.headline": "{category} is over by",
  "alert.sub": "{transactions}, {timeLeft}.",
  "alert.transactions_one": "{count} transaction",
  "alert.transactions_other": "{count} transactions",
  "alert.daysLeft_one": "{count} day left in the month",
  "alert.daysLeft_other": "{count} days left in the month",
  "alert.lastDay": "last day of the month",
  "alert.heroLabel": "Spent · {category} · {month}",
  "alert.heroSub": "of {budget} budgeted · {over} over · {transactions}",
  "alert.today": "Today · day {day} of {days}",
  "alert.driversTitle": "What's driving it",
  "alert.driversCount": "Top {shown} of {total}",
  "alert.tag.recurring": "Recurring",
  "alert.cta.open": "Open {category}",
  "alert.cta.adjust": "Adjust budget",
  "alert.cta.mute": "Mute until {month}",
  "alert.foot.mute": "Mute this category",
  "alert.foot.note":
    "One alert per category per month. We won't email you again about {category} until {month}.",

  "report.subject": "{period} — net {net} · {rate}% saved{breaches}",
  "report.subjectBreaches_one": " · {count} budget breach",
  "report.subjectBreaches_other": " · {count} budget breaches",
  "report.cadence.weekly": "Weekly",
  "report.cadence.monthly": "Monthly",
  "report.cadence.quarterly": "Quarterly",
  "report.brandTag.weekly": "Weekly report",
  "report.brandTag.monthly": "Monthly report",
  "report.brandTag.quarterly": "Quarterly report",
  "report.title": "{cadence} report — {period}",
  "report.preheader": "{period} · {income} in, {expenses} out, balance {balance}",
  "report.eyebrow": "Summary · {period}",
  "report.verdict.saved": "You saved",
  "report.verdict.overspentPre": "You spent",
  "report.verdict.overspentPost": "more than you earned.",
  "report.sub": "{transactions} this period.",
  "report.transactions_one": "{count} transaction",
  "report.transactions_other": "{count} transactions",
  "report.savingsRate": "{rate}% savings rate.",
  "report.stat.income": "Income",
  "report.stat.expenses": "Expenses",
  "report.stat.net": "Net · saved",
  "report.stat.rate": "{rate}% rate",
  "report.vsPrev.weekly": "vs prev. week",
  "report.vsPrev.monthly": "vs prev. month",
  "report.vsPrev.quarterly": "vs prev. quarter",
  "report.breachTitle": "Over budget",
  "report.breachCount_one": "{count} category",
  "report.breachCount_other": "{count} categories",
  "report.overTag": "over",
  "report.categoriesTitle": "Where it went",
  "report.categoriesCount": "Top {count}",
  "report.specialTitle": "Special budgets",
  "report.specialCount_one": "{count} envelope",
  "report.specialCount_other": "{count} envelopes",
  "report.closedTag": "closed",
  "report.accountsTitle": "Accounts",
  "report.totalBalance": "Total balance",
  "report.cta.dashboard": "Open dashboard",
  "report.foot.cadence": "Switch cadence",
  "report.foot.note":
    "You're receiving this because {cadence} reports are on.{pdf} {schedule} · Spending Tracker.",
  "report.foot.pdf": " PDF report attached.",
  "report.schedule.weekly": "Sent every Monday",
  "report.schedule.monthly": "Sent on the 1st of each month",
  "report.schedule.quarterly": "Sent at the start of each quarter",
  "report.periodLabel.weekly": "Week of {date}",

  "pdf.filename": "report",
  "pdf.brandTag": "SPENDING TRACKER - REPORT",
  "pdf.docType": "REPORT",
  "pdf.cover": "Financial summary",
  "pdf.verdict.saved": "You saved {amount} EUR.",
  "pdf.verdict.overspent": "You spent {amount} EUR more than you earned.",
  "pdf.generated": "GENERATED",
  "pdf.transactions": "TRANSACTIONS",
  "pdf.savingsRate": "SAVINGS RATE",
  "pdf.s1": "01 - Overview",
  "pdf.s1sub": "Period summary",
  "pdf.s2": "02 - Breakdown",
  "pdf.s2sub": "Categories",
  "pdf.s3": "03 - Accounts",
  "pdf.s3sub": "Balances by account",
  "pdf.s4": "04 - Alerts",
  "pdf.s4sub": "Over budget",
  "pdf.s5": "05 - Envelopes",
  "pdf.s5sub": "Special budgets",
  "pdf.income": "Income",
  "pdf.expenses": "Expenses",
  "pdf.net": "Net for the period",
  "pdf.totalBalance": "TOTAL BALANCE",
  "pdf.colCategory": "CATEGORY",
  "pdf.colAmount": "AMOUNT",
  "pdf.colShare": "SHARE",
  "pdf.colAccount": "ACCOUNT",
  "pdf.colIncome": "INCOME",
  "pdf.colExpenses": "EXPENSES",
  "pdf.colBalance": "BALANCE",
  "pdf.overTag": "OVER",
  "pdf.closedTag": "CLOSED",
  "pdf.vsPrev": "vs previous period",
};

const DICTS: Record<EmailLang, Dict> = { fr: FR, en: EN };

/**
 * Look up `key` and interpolate `{placeholder}` params. Falls back to the
 * French string, then to the key itself, so a missing translation degrades
 * to something renderable rather than blank.
 */
export function tr(
  lang: EmailLang,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const raw = DICTS[lang][key] ?? FR[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_m, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`,
  );
}

/**
 * Plural helper. Both locales here are "one / other", so a simple count
 * check is enough — no Intl.PluralRules needed. French treats 0 as
 * singular ("0 jour"), English as plural ("0 days"), which is what
 * `Math.abs(count) < 2` vs `=== 1` gives us.
 */
export function trPlural(
  lang: EmailLang,
  keyBase: string,
  count: number,
  params: Record<string, string | number> = {},
): string {
  const isOne = lang === "fr" ? Math.abs(count) < 2 : Math.abs(count) === 1;
  return tr(lang, `${keyBase}_${isOne ? "one" : "other"}`, { count, ...params });
}

const INTL_LOCALE: Record<EmailLang, string> = { fr: "fr-FR", en: "en-GB" };

/**
 * Currency formatting. Edge functions have no access to the user's
 * in-app currency preference (it lives in localStorage), so the euro is
 * assumed — same as before this change. What is now correct is the
 * *placement* and separators: "1 234,56 €" in French, "€1,234.56" in
 * English.
 *
 * Returns an HTML-safe string: the non-breaking space French uses between
 * the amount and the symbol is emitted as `&nbsp;` so it survives email
 * clients that collapse whitespace.
 */
export function money(lang: EmailLang, value: number, opts: { decimals?: number; sign?: boolean } = {}): string {
  const decimals = opts.decimals ?? 2;
  const abs = Math.abs(value);
  const digits = abs.toLocaleString(INTL_LOCALE[lang], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // toLocaleString uses U+202F/U+00A0 as the French group separator; both
  // render inconsistently across mail clients, so normalise to &nbsp;.
  const grouped = digits.replace(/[  ]/g, "&nbsp;");
  const prefix = value < 0 ? "−" : opts.sign && value > 0 ? "+" : "";
  return lang === "fr" ? `${prefix}${grouped}&nbsp;€` : `${prefix}€${grouped}`;
}

/**
 * Same formatting as `money()`, split so the hero figure can set the
 * currency symbol smaller and greyed (the design's `.cur` treatment) while
 * the digits carry the weight.
 */
export function moneyParts(
  lang: EmailLang,
  value: number,
  opts: { decimals?: number } = {},
): { symbol: string; digits: string; symbolFirst: boolean } {
  const formatted = money(lang, value, opts);
  return lang === "fr"
    ? { symbol: "€", digits: formatted.replace(/&nbsp;€$/, ""), symbolFirst: false }
    : { symbol: "€", digits: formatted.replace(/^(−?)€/, "$1"), symbolFirst: true };
}

/** Short driver-row date: "26 avr." / "26 Apr". */
export function shortDate(lang: EmailLang, iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(INTL_LOCALE[lang], { day: "2-digit", month: "short" });
}

/** "avril 2026" / "April 2026". */
export function monthYear(lang: EmailLang, date: Date): string {
  return date.toLocaleDateString(INTL_LOCALE[lang], { month: "long", year: "numeric" });
}

/** "mai" / "May" — used for the "mute until <month>" copy. */
export function monthName(lang: EmailLang, date: Date): string {
  return date.toLocaleDateString(INTL_LOCALE[lang], { month: "long" });
}

/**
 * Base URL for links back into the app. Every CTA and footer link in the
 * emails used to be `href="#"`; they now deep-link here. Falls back to the
 * production host so a missing env var degrades to a working link rather
 * than a dead one.
 */
export function appUrl(): string {
  const raw = Deno.env.get("APP_URL") || "https://banks-tracker.app";
  return raw.replace(/\/+$/, "");
}
