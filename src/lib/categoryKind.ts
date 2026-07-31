/**
 * Categories have a direction: a budget line is a ceiling on what leaves,
 * so "Loyer" has no business being offered on a salary. `kind` splits the
 * list, and these helpers are how every picker consumes it.
 */

export type CategoryKind = "expense" | "income";

/** Rows written before `kind` existed carry the column's default. */
export const kindOf = (category: { kind?: string | null }): CategoryKind =>
  category.kind === "income" ? "income" : "expense";

/**
 * Which half of the list a transaction may draw from. Transfers borrow the
 * expense side: they move money rather than earn it, and the few that get
 * categorised are read as outgoings everywhere else in the app.
 */
export const kindForTransactionType = (type: string | null | undefined): CategoryKind =>
  type === "income" ? "income" : "expense";

/**
 * The categories a picker should offer for a transaction.
 *
 * `selectedId` is not a convenience — it is the correctness of this
 * function. Around a hundred income transactions were categorised while
 * the list was undivided, so filtering strictly would show a blank select
 * on a transaction that plainly has a category, and saving that form would
 * quietly drop it. An assigned category stays offerable however it is
 * classified; the filter only governs what can be picked next.
 */
export const categoriesForType = <T extends { id: string; kind?: string | null }>(
  categories: T[],
  type: string | null | undefined,
  selectedId?: string | null,
): T[] => {
  const wanted = kindForTransactionType(type);
  return categories.filter((c) => kindOf(c) === wanted || (!!selectedId && c.id === selectedId));
};
