/**
 * Rounds a number to 2 decimal places to avoid floating point precision issues
 * in financial calculations.
 *
 * @example
 * roundCurrency(9.999999999999998) // returns 10.00
 * roundCurrency(100.005) // returns 100.01
 */
export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Safely subtracts two currency amounts, avoiding floating point errors.
 */
export function subtractCurrency(a: number, b: number): number {
  return roundCurrency(a - b);
}

/**
 * Splits an already-formatted amount into the part set at full size and the
 * cents, which the display type drops back to a mute weight.
 *
 * Works off the formatted string rather than the number so it stays correct
 * whatever locale and currency the user has picked — the separator, the
 * grouping and the symbol's side all come from `Intl`, not from us.
 *
 * @example
 * splitFormattedAmount("43 640,65 €") // { head: "43 640", tail: ",65 €" }
 * splitFormattedAmount("$43,640.65")  // { head: "$43,640", tail: ".65" }
 */
export function splitFormattedAmount(formatted: string): { head: string; tail: string } {
  // The decimal separator is the one followed by exactly two digits and no
  // more — a thousands separator always has three behind it. Whatever trails
  // those two digits (a symbol, a non-breaking space) rides along with them.
  const match = /[.,]\d{2}(?!\d)/.exec(formatted);
  if (!match) return { head: formatted, tail: "" };
  return {
    head: formatted.slice(0, match.index),
    tail: formatted.slice(match.index),
  };
}
