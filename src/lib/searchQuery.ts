/**
 * Natural-language query parser for the command palette. Recognises type
 * + entity (category / account) + period tokens in both French and
 * English, regardless of the active UI locale — so a French user can
 * still type "expenses loyer ytd" and an English user "dépenses 2025".
 *
 * Output is a structured query the palette / result-sheet can run
 * directly against the in-memory transaction list. The parser is pure;
 * no React / no Supabase.
 */

export type QueryType = "income" | "expense" | "transfer";

export type PeriodKind =
  | "ytd"
  | "mtd"
  | "this_week"
  | "last_week"
  | "last_month"
  | "last_year"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months"
  | "year"
  | "quarter"
  | "today"
  | "yesterday"
  | "named_month"
  | "all_time";

export interface ParsedQuery {
  type?: QueryType;
  categoryIds: string[];
  accountIds: string[];
  /** Tokens that didn't match a type/period/entity but should be used
   *  as an AND-filter against transaction descriptions. Stored in
   *  normalised form (lowercased, accent-stripped) so consumers can
   *  match them directly against `normalise(tx.description)`. */
  descriptionTokens: string[];
  /** Inclusive date window for the matched period. */
  dateRange: { start: Date; end: Date };
  /** Stable i18n key + default for rendering "Year to date", "March 2025"… */
  periodLabelKey: string;
  periodLabelDefault: string;
  /** Resolved period kind (useful for chip highlighting). */
  periodKind: PeriodKind;
  /** True when the user did not type any period token, so we silently
   *  fell back to YTD. The UI uses this to show a removable hint chip. */
  periodWasDefault: boolean;
  /** Original input, normalised (accent-stripped, lower-cased). */
  normalisedInput: string;
  /** Anything we did not consume — useful for diagnostics. */
  unmatchedTokens: string[];
  /** True when the input made enough sense to act on (any of: type, period, category match, account match). */
  hasSignal: boolean;
  /** Friendly description of what was matched, for the result header. */
  matchedDescription: string[];
}

interface ParseOptions {
  categories: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  /** Override "today" — useful for tests / deterministic snapshots. */
  today?: Date;
  /** UI locale used for human-readable defaults (e.g. month names in
   *  the named-month label). The parser's matching is locale-agnostic;
   *  this only affects labels that fall back to `defaultValue`. */
  locale?: "fr" | "en";
}

/** Strip diacritics and lowercase for forgiving matching. Exported so
 *  consumers (the palette filter, the result modal) can fold transaction
 *  descriptions the same way the parser folds the input — "Société
 *  Générale" matches "societe generale" and the inverse. */
export const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['']/g, " ");

const TYPE_VOCAB: Record<QueryType, string[]> = {
  expense: [
    "expense", "expenses", "spending", "spent", "outgoing", "out",
    "expenditure", "expenditures",
    "depense", "depenses", "sortie", "sorties", "depensee", "depensees",
  ],
  income: [
    "income", "incomes", "revenue", "revenues", "earnings", "earned",
    "incoming", "in",
    "revenu", "revenus", "gain", "gains", "entree", "entrees",
  ],
  transfer: [
    "transfer", "transfers",
    "virement", "virements", "transfert", "transferts",
  ],
};

/**
 * Period vocabulary. Each entry is a list of phrases that resolve to
 * the same period kind. Longer phrases must be checked before shorter
 * ones (e.g. "last 3 months" before "last").
 */
const PERIOD_VOCAB: { kind: PeriodKind; phrases: string[] }[] = [
  {
    kind: "last_12_months",
    phrases: [
      "last 12 months", "past 12 months", "trailing 12 months",
      "12 derniers mois", "12 mois", "douze mois",
      "1 an", "un an",
      "12m", "m12", "1y", "y1", "y12",
    ],
  },
  {
    kind: "last_6_months",
    phrases: [
      "last 6 months", "past 6 months", "6 months",
      "6 derniers mois", "6 mois", "six mois",
      "6m", "m6",
    ],
  },
  {
    kind: "last_3_months",
    phrases: [
      "last 3 months", "past 3 months", "3 months", "trailing 3 months",
      "3 derniers mois", "3 mois", "trois mois",
      "3m", "m3",
    ],
  },
  {
    kind: "last_month",
    phrases: [
      "last month", "previous month",
      "mois dernier", "le mois dernier", "mois precedent",
      "lm",
    ],
  },
  {
    kind: "mtd",
    phrases: [
      "month to date", "month-to-date", "mtd",
      "this month", "current month",
      "ce mois", "ce mois ci", "mois en cours", "mois courant",
    ],
  },
  {
    kind: "last_year",
    phrases: [
      "last year", "previous year",
      "annee derniere", "l annee derniere", "annee precedente", "an dernier",
      "ly",
    ],
  },
  {
    kind: "ytd",
    phrases: [
      "year to date", "year-to-date", "ytd",
      "this year", "current year",
      "cette annee", "annee en cours", "annee courante",
      "depuis le debut de l annee", "depuis le debut de l an",
    ],
  },
  {
    kind: "this_week",
    phrases: [
      "this week", "current week",
      "cette semaine", "semaine en cours", "semaine courante",
      "tw", "w0",
    ],
  },
  {
    kind: "last_week",
    phrases: [
      "last week", "previous week",
      "semaine derniere", "la semaine derniere", "semaine precedente",
      "lw", "w1",
    ],
  },
  {
    kind: "yesterday",
    phrases: ["yesterday", "hier"],
  },
  {
    kind: "today",
    phrases: ["today", "aujourd hui", "aujourd'hui"],
  },
];

/**
 * Named-month vocabulary — both English and French, with their
 * accent-stripped forms. Order matters only insofar as we iterate
 * 0..11 to find a match; the working string has already been
 * normalised so accent-folded entries are sufficient.
 */
const MONTH_NAMES: { phrases: string[]; index: number }[] = [
  { index: 0, phrases: ["january", "jan", "janvier", "janv"] },
  { index: 1, phrases: ["february", "feb", "fevrier", "fev"] },
  { index: 2, phrases: ["march", "mar", "mars"] },
  { index: 3, phrases: ["april", "apr", "avril", "avr"] },
  { index: 4, phrases: ["may", "mai"] },
  { index: 5, phrases: ["june", "jun", "juin"] },
  { index: 6, phrases: ["july", "jul", "juillet", "juil"] },
  { index: 7, phrases: ["august", "aug", "aout"] },
  { index: 8, phrases: ["september", "sept", "sep", "septembre"] },
  { index: 9, phrases: ["october", "oct", "octobre"] },
  { index: 10, phrases: ["november", "nov", "novembre"] },
  { index: 11, phrases: ["december", "dec", "decembre"] },
];

/** Quarter literal: q1..q4 (optionally prefixed/suffixed by a year). */
const QUARTER_RE = /\b(?:(\d{4})\s*[-_]?\s*)?q([1-4])(?:\s*[-_]?\s*(\d{4}))?\b/;

/** Stand-alone 4-digit year, plausible range. */
const YEAR_RE = /\b(20\d{2}|19\d{2})\b/;

const startOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};
const endOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
};

const monthName = (d: Date, locale: "fr" | "en") => {
  try {
    return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return `${d.getMonth() + 1}/${d.getFullYear()}`;
  }
};

/**
 * Compute a date range + display label for a recognised period kind.
 * Pulls "today" from options so tests can pin time. Locale only
 * affects the human-readable label.
 */
function rangeFor(
  kind: PeriodKind,
  today: Date,
  locale: "fr" | "en",
  literalYear?: number,
  literalQuarter?: number,
  literalMonth?: number
): { start: Date; end: Date; labelKey: string; labelDefault: string } {
  const t = startOfDay(today);
  const year = t.getFullYear();
  const month = t.getMonth();

  switch (kind) {
    case "ytd":
      return {
        start: new Date(year, 0, 1, 0, 0, 0, 0),
        end: endOfDay(t),
        labelKey: "search.period.ytd",
        labelDefault: "Year to date",
      };
    case "mtd":
      return {
        start: new Date(year, month, 1, 0, 0, 0, 0),
        end: endOfDay(t),
        labelKey: "search.period.mtd",
        labelDefault: monthName(t, locale),
      };
    case "this_week": {
      const day = t.getDay() === 0 ? 6 : t.getDay() - 1;
      const start = new Date(t);
      start.setDate(t.getDate() - day);
      return {
        start: startOfDay(start),
        end: endOfDay(t),
        labelKey: "search.period.thisWeek",
        labelDefault: "This week",
      };
    }
    case "last_week": {
      const day = t.getDay() === 0 ? 6 : t.getDay() - 1;
      const thisStart = new Date(t);
      thisStart.setDate(t.getDate() - day);
      const lastEnd = new Date(thisStart);
      lastEnd.setDate(thisStart.getDate() - 1);
      const lastStart = new Date(lastEnd);
      lastStart.setDate(lastEnd.getDate() - 6);
      return {
        start: startOfDay(lastStart),
        end: endOfDay(lastEnd),
        labelKey: "search.period.lastWeek",
        labelDefault: "Last week",
      };
    }
    case "last_month": {
      const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const end = endOfDay(new Date(year, month, 0));
      return {
        start,
        end,
        labelKey: "search.period.lastMonth",
        labelDefault: monthName(start, locale),
      };
    }
    case "last_year":
      return {
        start: new Date(year - 1, 0, 1, 0, 0, 0, 0),
        end: endOfDay(new Date(year - 1, 11, 31)),
        labelKey: "search.period.lastYear",
        labelDefault: String(year - 1),
      };
    case "last_3_months": {
      const start = startOfDay(new Date(t));
      start.setMonth(start.getMonth() - 3);
      return {
        start,
        end: endOfDay(t),
        labelKey: "search.period.last3Months",
        labelDefault: "Last 3 months",
      };
    }
    case "last_6_months": {
      const start = startOfDay(new Date(t));
      start.setMonth(start.getMonth() - 6);
      return {
        start,
        end: endOfDay(t),
        labelKey: "search.period.last6Months",
        labelDefault: "Last 6 months",
      };
    }
    case "last_12_months": {
      const start = startOfDay(new Date(t));
      start.setMonth(start.getMonth() - 12);
      return {
        start,
        end: endOfDay(t),
        labelKey: "search.period.last12Months",
        labelDefault: "Last 12 months",
      };
    }
    case "year": {
      const y = literalYear ?? year;
      return {
        start: new Date(y, 0, 1, 0, 0, 0, 0),
        end: endOfDay(new Date(y, 11, 31)),
        labelKey: "search.period.year",
        labelDefault: String(y),
      };
    }
    case "quarter": {
      const y = literalYear ?? year;
      const q = literalQuarter ?? 1;
      const startMonth = (q - 1) * 3;
      return {
        start: new Date(y, startMonth, 1, 0, 0, 0, 0),
        end: endOfDay(new Date(y, startMonth + 3, 0)),
        labelKey: "search.period.quarter",
        labelDefault: `Q${q} ${y}`,
      };
    }
    case "today":
      return {
        start: startOfDay(t),
        end: endOfDay(t),
        labelKey: "search.period.today",
        labelDefault: "Today",
      };
    case "yesterday": {
      const y = new Date(t);
      y.setDate(t.getDate() - 1);
      return {
        start: startOfDay(y),
        end: endOfDay(y),
        labelKey: "search.period.yesterday",
        labelDefault: "Yesterday",
      };
    }
    case "named_month": {
      const m = literalMonth ?? month;
      const y = literalYear ?? year;
      const start = new Date(y, m, 1, 0, 0, 0, 0);
      return {
        start,
        end: endOfDay(new Date(y, m + 1, 0)),
        labelKey: "search.period.namedMonth",
        labelDefault: monthName(start, locale),
      };
    }
    case "all_time":
    default:
      return {
        start: new Date(1970, 0, 1, 0, 0, 0, 0),
        end: endOfDay(t),
        labelKey: "search.period.allTime",
        labelDefault: "All time",
      };
  }
}

/**
 * Try to greedily match the longest period phrase against the working
 * string. Returns the consumed substring (so the caller can remove it)
 * and the resolved kind, or `null` if nothing matched.
 */
function detectPeriodPhrase(
  working: string
): { kind: PeriodKind; consumed: string } | null {
  for (const entry of PERIOD_VOCAB) {
    for (const phrase of entry.phrases) {
      const re = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "i");
      const match = working.match(re);
      if (match) {
        return { kind: entry.kind, consumed: match[0] };
      }
    }
  }
  return null;
}

/**
 * Match a named month, optionally adjacent to a year. Returns the
 * 0-indexed month, the optional year, and the consumed substring so
 * the caller can strip it from the working string.
 */
function detectNamedMonth(
  working: string
): { index: number; year?: number; consumed: string } | null {
  for (const m of MONTH_NAMES) {
    for (const phrase of m.phrases) {
      // Year optionally on either side: "march 2025", "2024 august".
      const re = new RegExp(
        `(?:(\\d{4})\\s+)?\\b${phrase}\\b(?:\\s+(\\d{4}))?`,
        "i"
      );
      const match = working.match(re);
      if (match) {
        const year = match[1]
          ? parseInt(match[1], 10)
          : match[2]
          ? parseInt(match[2], 10)
          : undefined;
        return { index: m.index, year, consumed: match[0].trim() };
      }
    }
  }
  return null;
}

/** Match a single type token by exact word presence. */
function detectType(working: string): { type: QueryType; consumed: string } | null {
  const tokens = working.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    for (const [type, words] of Object.entries(TYPE_VOCAB) as [QueryType, string[]][]) {
      if (words.includes(tok)) return { type, consumed: tok };
    }
  }
  return null;
}

/** Match category / account names against the remaining text. */
function matchEntities(
  remaining: string,
  candidates: { id: string; name: string }[]
): { ids: string[]; matchedNames: string[]; consumed: string[] } {
  const tokens = remaining.split(/\s+/).filter(Boolean);
  const ids: string[] = [];
  const matchedNames: string[] = [];
  const consumed: string[] = [];

  // Try multi-word names first (sort by descending word count) so a
  // category like "Loisirs et sorties" beats "Loisirs" alone.
  const sorted = candidates
    .map((c) => ({ ...c, normalised: normalise(c.name) }))
    .sort((a, b) => b.normalised.split(/\s+/).length - a.normalised.split(/\s+/).length);

  for (const cand of sorted) {
    if (!cand.normalised) continue;
    const candTokens = cand.normalised.split(/\s+/).filter(Boolean);
    // Exact contiguous run match
    for (let i = 0; i + candTokens.length <= tokens.length; i++) {
      const slice = tokens.slice(i, i + candTokens.length);
      if (slice.every((t, j) => t === candTokens[j])) {
        ids.push(cand.id);
        matchedNames.push(cand.name);
        consumed.push(...slice);
        // Mark consumed tokens
        for (let k = i; k < i + candTokens.length; k++) tokens[k] = "";
        break;
      }
    }
  }

  // Single-token substring fallback for short queries ("loyer" → "Loyer").
  if (ids.length === 0) {
    for (const tok of tokens) {
      if (!tok || tok.length < 3) continue;
      const hit = candidates.find((c) => normalise(c.name).includes(tok));
      if (hit) {
        ids.push(hit.id);
        matchedNames.push(hit.name);
        consumed.push(tok);
      }
    }
  }

  return { ids, matchedNames, consumed };
}

export function parseQuery(
  rawInput: string,
  options: ParseOptions
): ParsedQuery | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const today = options.today ?? new Date();
  let working = normalise(trimmed);
  const matchedDescription: string[] = [];

  // 1. Type token
  const typeMatch = detectType(working);
  let type: QueryType | undefined;
  if (typeMatch) {
    type = typeMatch.type;
    working = working.replace(new RegExp(`\\b${typeMatch.consumed}\\b`), " ").trim();
    matchedDescription.push(`type:${typeMatch.type}`);
  }

  // 2. Quarter literal (before generic year, since "2025 q1" includes a year)
  let periodKind: PeriodKind = "all_time";
  let literalYear: number | undefined;
  let literalQuarter: number | undefined;
  let literalMonth: number | undefined;
  const qMatch = working.match(QUARTER_RE);
  if (qMatch) {
    periodKind = "quarter";
    literalQuarter = parseInt(qMatch[2], 10);
    literalYear = qMatch[1] ? parseInt(qMatch[1], 10) : qMatch[3] ? parseInt(qMatch[3], 10) : undefined;
    working = working.replace(QUARTER_RE, " ").trim();
  } else {
    // 3. Period phrase (longest-first)
    const phraseMatch = detectPeriodPhrase(working);
    if (phraseMatch) {
      periodKind = phraseMatch.kind;
      working = working.replace(new RegExp(`\\b${phraseMatch.consumed.replace(/\s+/g, "\\s+")}\\b`, "i"), " ").trim();
    } else {
      // 4. Named month (optionally with a year): "march", "mars 2025", "2024 august"
      const monthMatch = detectNamedMonth(working);
      if (monthMatch) {
        periodKind = "named_month";
        literalMonth = monthMatch.index;
        literalYear = monthMatch.year;
        working = working
          .replace(new RegExp(`\\b${monthMatch.consumed}\\b`, "i"), " ")
          .replace(/\s+/g, " ")
          .trim();
      } else {
        // 5. Bare 4-digit year
        const yMatch = working.match(YEAR_RE);
        if (yMatch) {
          periodKind = "year";
          literalYear = parseInt(yMatch[1], 10);
          working = working.replace(YEAR_RE, " ").trim();
        }
      }
    }
  }
  if (periodKind !== "all_time") matchedDescription.push(`period:${periodKind}`);

  // 5. Entity matching against remaining tokens
  working = working.replace(/\s+/g, " ").trim();
  const catMatch = matchEntities(working, options.categories);
  if (catMatch.ids.length) {
    matchedDescription.push(`categories:${catMatch.matchedNames.join(",")}`);
    for (const tok of catMatch.consumed) {
      working = working.replace(new RegExp(`\\b${tok}\\b`, "g"), " ");
    }
    working = working.replace(/\s+/g, " ").trim();
  }

  const accMatch = matchEntities(working, options.accounts);
  if (accMatch.ids.length) {
    matchedDescription.push(`accounts:${accMatch.matchedNames.join(",")}`);
    for (const tok of accMatch.consumed) {
      working = working.replace(new RegExp(`\\b${tok}\\b`, "g"), " ");
    }
    working = working.replace(/\s+/g, " ").trim();
  }

  const leftover = working.split(/\s+/).filter(Boolean);

  // Tokens of length ≥ 2 become description-search tokens. Shorter
  // ones (stray punctuation, single characters) stay in
  // `unmatchedTokens` so the diagnostic line can flag them.
  const descriptionTokens = leftover.filter((t) => t.length >= 2);
  const unmatchedTokens = leftover.filter((t) => t.length < 2);
  if (descriptionTokens.length) {
    matchedDescription.push(`description:${descriptionTokens.join(",")}`);
  }

  // Default: if no period token, fall back to YTD — most common framing
  // for personal-finance "how much have I spent on X" questions.
  const periodWasDefault = periodKind === "all_time";
  const effectiveKind: PeriodKind = periodWasDefault ? "ytd" : periodKind;
  const range = rangeFor(
    effectiveKind,
    today,
    options.locale ?? "en",
    literalYear,
    literalQuarter,
    literalMonth
  );

  // hasSignal — at least one of type / period / category / account /
  // description hit. Description-only queries (e.g. "uber") are valid:
  // they roll up every transaction with "uber" in its description.
  const hasSignal = Boolean(
    type ||
      periodKind !== "all_time" ||
      catMatch.ids.length ||
      accMatch.ids.length ||
      descriptionTokens.length
  );

  return {
    type,
    categoryIds: catMatch.ids,
    accountIds: accMatch.ids,
    descriptionTokens,
    dateRange: { start: range.start, end: range.end },
    periodLabelKey: range.labelKey,
    periodLabelDefault: range.labelDefault,
    periodKind: effectiveKind,
    periodWasDefault,
    normalisedInput: normalise(trimmed),
    unmatchedTokens,
    hasSignal,
    matchedDescription,
  };
}
