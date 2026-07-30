/**
 * Shared formatting helpers for Trace's rendered blocks.
 *
 * Lives outside the component files so both the answer table and the
 * proposal diff align cells the same way — the two used to carry
 * separate copies and drifted.
 */

/**
 * True when a table cell reads as a figure and should be right-aligned in
 * tabular numerals: a leading sign, a currency symbol or digit, a trailing
 * percent, or an em dash standing in for "no value".
 */
export const isNumericCell = (cell: string) => /^[−+-]?[\p{Sc}\d]|%$|^—$/u.test(cell.trim());
