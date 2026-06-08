import {
  Plane,
  Gift,
  Wrench,
  MapPin,
  Utensils,
  ShoppingCart,
  Heart,
  Music,
  ShoppingBag,
  Car,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Transaction } from "@/hooks/useFinancialData";
import type { SpecialBudget, SpecialBudgetStatus } from "@/hooks/useSpecialBudgets";
import { parseLocalDate } from "@/lib/dateUtils";

/** Icon registry. Keys map 1:1 to design icon ids; new keys can be added
 *  freely. The default fallback is the wallet glyph. */
export const SPECIAL_BUDGET_ICONS: Record<string, LucideIcon> = {
  plane: Plane,
  gift: Gift,
  tools: Wrench,
  pin: MapPin,
  fork: Utensils,
  cart: ShoppingCart,
  heart: Heart,
  music: Music,
  bag: ShoppingBag,
  car: Car,
};

export const SPECIAL_BUDGET_ICON_KEYS = Object.keys(SPECIAL_BUDGET_ICONS);

export const getSpecialBudgetIcon = (name: string | null | undefined): LucideIcon =>
  (name && SPECIAL_BUDGET_ICONS[name]) || Wallet;

/** Curated palette — each entry pairs a primary color with its soft tint
 *  and a darker "ink" used for icon strokes. Mirrors the design swatches
 *  while staying within the app's color rhythm. */
export const SPECIAL_BUDGET_PALETTE = [
  { color: "#4b5bd6", tint: "#e6e8fb", ink: "#3a47b0" },
  { color: "#2f9466", tint: "#dcefe4", ink: "#2c6b4f" },
  { color: "#cf5733", tint: "#f6e4dd", ink: "#9a552a" },
  { color: "#b07d15", tint: "#f4ecd8", ink: "#8a6a12" },
  { color: "#9a3f5c", tint: "#f4c6d4", ink: "#8a3852" },
  { color: "#6a4b9a", tint: "#e2d3f4", ink: "#5b47a8" },
] as const;

export type SpecialBudgetPaletteEntry = (typeof SPECIAL_BUDGET_PALETTE)[number];

/** Find the tint/ink pair for an arbitrary color string. Falls back to
 *  the palette's first entry if the color isn't in the curated set. */
export const paletteForColor = (color: string | null | undefined): SpecialBudgetPaletteEntry =>
  SPECIAL_BUDGET_PALETTE.find((p) => p.color === color) ?? SPECIAL_BUDGET_PALETTE[0];

const MS_PER_DAY = 86_400_000;

export interface SpecialBudgetComputed {
  spent: number;
  total: number;
  remaining: number;
  ratio: number;
  over: boolean;
  /** [0..1] elapsed fraction of the budget's date range, or null when
   *  the range isn't fully known. */
  elapsedFrac: number | null;
  daysLeft: number | null;
  totalDays: number | null;
  /** Days from today until start_date, only set when status === 'planned'. */
  startsIn: number | null;
  isLastDay: boolean;
  /** True when active spend pace is materially ahead of elapsed time
   *  (a "rythme élevé" signal). */
  hot: boolean;
}

/** Compute the per-budget figures used by every card / sheet surface.
 *
 *  Spend is summed from the provided expense transactions that are
 *  tagged to this budget. Refunds (refunded_amount) are netted out so a
 *  refunded restaurant bill doesn't inflate the envelope's spent line. */
export function computeSpecialBudget(
  budget: SpecialBudget,
  transactions: Transaction[],
  today: Date = new Date()
): SpecialBudgetComputed {
  // Special budgets are an envelope of real cash outflows for an event/trip,
  // so they intentionally include transactions tagged "excluded from stats"
  // (the envelope is the whole point of tracking them) and always net out
  // any refunds.
  const spent = transactions
    .filter((tx) => tx.special_budget_id === budget.id && tx.type === "expense")
    .reduce((s, tx) => s + Math.max(0, tx.amount - (tx.refunded_amount || 0)), 0);

  const total = budget.total_budget || 0;
  const remaining = total - spent;
  const ratio = total > 0 ? spent / total : 0;
  const over = total > 0 && spent > total;

  const start = budget.start_date ? parseLocalDate(budget.start_date) : null;
  const end = budget.end_date ? parseLocalDate(budget.end_date) : null;

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let elapsedFrac: number | null = null;
  let daysLeft: number | null = null;
  let totalDays: number | null = null;
  let startsIn: number | null = null;
  let isLastDay = false;

  if (start && end) {
    totalDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
    const elapsed = Math.round((startOfToday.getTime() - start.getTime()) / MS_PER_DAY) + 1;
    elapsedFrac = Math.max(0, Math.min(1, elapsed / totalDays));
    daysLeft = Math.max(0, Math.round((end.getTime() - startOfToday.getTime()) / MS_PER_DAY));
    isLastDay = daysLeft === 0 && startOfToday <= end;
  }

  if (start && budget.status === "planned") {
    startsIn = Math.max(0, Math.round((start.getTime() - startOfToday.getTime()) / MS_PER_DAY));
  }

  const hot =
    budget.status === "active" &&
    elapsedFrac != null &&
    !over &&
    ratio > elapsedFrac + 0.12;

  return { spent, total, remaining, ratio, over, elapsedFrac, daysLeft, totalDays, startsIn, isLastDay, hot };
}

/** Localised range label. */
const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtDay = (d: Date, locale: "fr" | "en"): string => {
  const m = locale === "fr" ? MONTHS_FR[d.getMonth()] : MONTHS_EN[d.getMonth()];
  return locale === "fr" ? `${d.getDate()} ${m}` : `${m} ${d.getDate()}`;
};

export function formatSpecialBudgetRange(
  startISO: string | null,
  endISO: string | null,
  locale: "fr" | "en"
): string {
  if (!startISO) return "—";
  const start = parseLocalDate(startISO);
  const end = endISO ? parseLocalDate(endISO) : null;
  const thisYear = new Date().getFullYear();
  const yS = start.getFullYear() !== thisYear ? ` ${start.getFullYear()}` : "";
  if (!end) {
    return locale === "fr"
      ? `depuis le ${fmtDay(start, locale)}${yS}`
      : `since ${fmtDay(start, locale)}${yS}`;
  }
  const yE = end.getFullYear() !== thisYear ? ` ${end.getFullYear()}` : "";
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const m = locale === "fr" ? MONTHS_FR[end.getMonth()] : MONTHS_EN[end.getMonth()];
    return locale === "fr"
      ? `${start.getDate()}–${end.getDate()} ${m}${yE}`
      : `${m} ${start.getDate()}–${end.getDate()}${yE}`;
  }
  return `${fmtDay(start, locale)} – ${fmtDay(end, locale)}${yE}`;
}

/** Status pill metadata. Keep the keys stable — the i18n layer fills
 *  the labels. */
export const SPECIAL_BUDGET_STATUS_META: Record<
  SpecialBudgetStatus,
  { cls: "active" | "planned" | "closed" }
> = {
  active: { cls: "active" },
  planned: { cls: "planned" },
  closed: { cls: "closed" },
};
