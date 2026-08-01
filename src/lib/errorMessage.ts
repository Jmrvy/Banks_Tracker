/**
 * Turns whatever was thrown into something worth showing a user.
 *
 * Supabase rejects with a PostgrestError — a plain `{ message, details,
 * hint, code }` object, not an Error instance — so the usual
 * `err instanceof Error ? err.message : String(err)` falls through to
 * String() and renders "[object Object]". That is strictly worse than the
 * fixed string it replaced, because it looks like a real diagnosis.
 *
 * `details` and `hint` are where Postgres names the constraint or suggests
 * the fix, so they are worth carrying when present.
 */
/** Postgres unique-violation. Worth naming, since the user can fix it. */
export const isDuplicateError = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23505";

export function describeError(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;

  if (typeof err === "object") {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [e.message, e.details, e.hint]
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim());
    // Deduplicate: Postgres often repeats the message inside details.
    const unique = parts.filter((p, i) => parts.indexOf(p) === i);
    if (unique.length) {
      const text = unique.join(" — ");
      return typeof e.code === "string" && e.code ? `${text} (${e.code})` : text;
    }
    if (typeof e.code === "string" && e.code) return `Error ${e.code}`;
  }

  // Never let an opaque object through as "[object Object]".
  try {
    const json = JSON.stringify(err);
    if (json && json !== "{}") return json;
  } catch {
    /* circular or otherwise unserialisable */
  }
  return "";
}
