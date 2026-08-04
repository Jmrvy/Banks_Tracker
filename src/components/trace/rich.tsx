import { Fragment } from "react";

/**
 * `**bold**` is the only markup Trace is allowed to emit, and this is the
 * one place that renders it.
 *
 * It used to live inside TraceBlocks and be applied to exactly one field —
 * the `text` block's prose. The model, quite reasonably, does not treat
 * emphasis as a per-field privilege: it writes `**Loyer**` wherever it is
 * naming a category, which meant list items, proposal summaries and impact
 * lines showed raw asterisks to the user while the paragraph above them
 * rendered correctly.
 *
 * So it moved here and is applied to every prose-bearing field instead.
 * Shared rather than exported from TraceBlocks because TraceBlocks imports
 * TraceProposal, and the reverse import would close a cycle.
 *
 * Anything without `**` comes back unchanged, so it is safe to wrap fields
 * that should never carry markup — on those it doubles as a cleanup for
 * stray asterisks that would otherwise reach the user verbatim.
 */
export function rich(text: string) {
  return String(text ?? "")
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}
