/** Reads a `next` query param, accepting only same-origin relative paths. */
export function safeNext(search: string): string | null {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
