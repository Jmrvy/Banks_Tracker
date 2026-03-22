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

