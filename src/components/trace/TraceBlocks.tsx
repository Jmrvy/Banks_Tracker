import {useEffect, useState} from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Info,
  Layers,
  Minus,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TraceProposal } from "@/components/trace/TraceProposal";
import type { TraceBlock } from "@/contexts/TraceContext";
import { isNumericCell } from "@/lib/traceFormat";
import { cn } from "@/lib/utils";
import { rich } from "@/components/trace/rich";

function Figure({ b }: { b: Extract<TraceBlock, { t: "figure" }> }) {
  const sign = b.delta?.v.trim().charAt(0);
  const DeltaIcon =
    b.delta?.dir === "flat" ? Minus : sign === "−" || sign === "-" ? ArrowDownRight : ArrowUpRight;
  return (
    <div className="rounded-xl border border-line bg-bg-subtle/50 px-4 py-3.5">
      <div className="text-[10.5px] uppercase tracking-[0.09em] font-semibold text-muted-foreground">
        {rich(b.label)}
      </div>
      <div className="mt-1.5 text-2xl sm:text-[28px] font-semibold tracking-tight tabular-nums leading-none">
        {b.value}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {b.delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono font-medium",
              b.delta.dir === "good" && "text-pos",
              b.delta.dir === "bad" && "text-neg",
              b.delta.dir === "flat" && "text-muted-foreground",
            )}
          >
            <DeltaIcon className="h-3 w-3" />
            {b.delta.v}
          </span>
        )}
        <span className="text-muted-foreground">{rich(b.sub)}</span>
      </div>
    </div>
  );
}

function BlockTable({ b }: { b: Extract<TraceBlock, { t: "table" }> }) {
  return (
    <div className="rounded-xl border border-line overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {b.cols.map((c, i) => (
              <th
                key={c}
                className={cn(
                  "px-3 py-2 font-medium text-muted-foreground text-[10.5px] uppercase tracking-[0.06em] whitespace-nowrap",
                  i === 0 ? "text-left" : "text-right",
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.rows.map((row, ri) => (
            <tr key={ri} className="border-t border-line">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "px-3 py-2",
                    ci === 0
                      ? "text-left font-medium"
                      : isNumericCell(cell)
                        ? "text-right font-mono tabular-nums whitespace-nowrap"
                        : "text-right text-muted-foreground",
                  )}
                >
                  {rich(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NOTE_ICON = {
  pos: CheckCircle2,
  neg: AlertTriangle,
  warn: AlertTriangle,
  info: Info,
} as const;

function Notes({ b }: { b: Extract<TraceBlock, { t: "list" }> }) {
  return (
    <div className="space-y-1.5">
      {b.items.map((item, i) => {
        const Icon = NOTE_ICON[item.tone];
        return (
          <div key={i} className="flex gap-2.5 rounded-xl border border-line bg-card px-3 py-2.5">
            <Icon
              className={cn(
                "h-3.5 w-3.5 mt-0.5 flex-shrink-0",
                item.tone === "pos" && "text-pos",
                item.tone === "neg" && "text-neg",
                item.tone === "warn" && "text-warning",
                item.tone === "info" && "text-muted-foreground",
              )}
            />
            <div className="min-w-0">
              <div className="text-xs font-medium">{rich(item.title)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{rich(item.body)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Forecast({ b }: { b: Extract<TraceBlock, { t: "forecast" }> }) {
  return (
    <div className="rounded-xl border border-line bg-card overflow-hidden">
      {b.rows.map((row, i) => (
        <div
          key={i}
          className="flex items-baseline justify-between gap-3 px-3.5 py-2 border-b border-line text-xs"
        >
          <span className="text-muted-foreground">{rich(row.k)}</span>
          <span
            className={cn(
              "font-mono tabular-nums font-medium whitespace-nowrap",
              row.tone === "pos" && "text-pos",
              row.tone === "neg" && "text-neg",
            )}
          >
            {row.v}
          </span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 px-3.5 py-2.5 bg-bg-subtle/60">
        <span className="text-xs font-medium">{rich(b.foot.k)}</span>
        <span
          className={cn(
            "font-mono tabular-nums text-sm font-semibold whitespace-nowrap",
            b.foot.tone === "pos" && "text-pos",
            b.foot.tone === "neg" && "text-neg",
          )}
        >
          {b.foot.v}
        </span>
      </div>
    </div>
  );
}

function Chips({ b }: { b: Extract<TraceBlock, { t: "chips" }> }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.09em] font-semibold text-muted-foreground mb-1.5">
        {rich(b.label)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {b.items.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs"
          >
            <span className="font-medium truncate max-w-[160px]">{rich(item.name)}</span>
            <span className="font-mono tabular-nums">{item.amount}</span>
            <span className="text-muted-foreground text-[11px]">{item.date}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Bars({ b }: { b: Extract<TraceBlock, { t: "bars" }> }) {
  // Chart palette tokens, so Trace's charts match every other chart in
  // the app in both themes.
  const colors = ["hsl(var(--chart-1))", "hsl(var(--chart-4))", "hsl(var(--chart-2))"];
  const data = b.months.map((month, i) => {
    const row: Record<string, string | number> = { month };
    b.series.forEach((s) => {
      row[s.name] = s.values[i] ?? 0;
    });
    return row;
  });
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="h-[180px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--line))",
                borderRadius: 10,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {b.series.map((s, i) => (
              <Bar key={s.name} dataKey={s.name} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1.5">{rich(b.note)}</div>
    </div>
  );
}

function Method({ b }: { b: Extract<TraceBlock, { t: "method" }> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-bg-subtle/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Layers className="h-3.5 w-3.5" />
        {t("trace.method", { defaultValue: "How I got this" })}
        <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <dl className="px-3 pb-3 pt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs border-t border-line">
          <dt className="text-muted-foreground">{t("trace.methodPeriod", { defaultValue: "Period" })}</dt>
          <dd>{b.period}</dd>
          <dt className="text-muted-foreground">{t("trace.methodFilters", { defaultValue: "Filters" })}</dt>
          <dd>
            <ul className="space-y-0.5">
              {b.filters.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </dd>
          <dt className="text-muted-foreground">{t("trace.methodExcluded", { defaultValue: "Excluded" })}</dt>
          <dd>{b.excluded}</dd>
          <dt className="text-muted-foreground">{t("trace.methodRows", { defaultValue: "Rows" })}</dt>
          <dd className="font-mono tabular-nums">{b.rows}</dd>
        </dl>
      )}
    </div>
  );
}

export function TraceBlockView({
  block,
  turnId,
  index,
}: {
  block: TraceBlock;
  turnId: string;
  index: number;
}) {
  switch (block.t) {
    case "text":
      return <p className="text-sm leading-relaxed text-muted-foreground">{rich(block.v)}</p>;
    case "figure":
      return <Figure b={block} />;
    case "table":
      return <BlockTable b={block} />;
    case "list":
      return <Notes b={block} />;
    case "forecast":
      return <Forecast b={block} />;
    case "chips":
      return <Chips b={block} />;
    case "bars":
      return <Bars b={block} />;
    case "method":
      return <Method b={block} />;
    case "proposal":
      return <TraceProposal block={block} turnId={turnId} index={index} />;
    default:
      return null;
  }
}

/**
 * Working indicator. The steps come from the model itself, so the user
 * sees what Trace actually did rather than a generic spinner.
 */
export function TraceWorking({ steps }: { steps: string[] }) {
  const { t } = useTranslation();
  const shown = steps.length
    ? steps
    : [
        t("trace.stepReading", { defaultValue: "Reading your ledger" }),
        t("trace.stepChecking", { defaultValue: "Checking the numbers" }),
      ];
  const [reached, setReached] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setReached((v) => Math.min(v + 1, shown.length)), 900);
    return () => clearInterval(id);
  }, [shown.length]);

  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      {shown.map((step, i) => (
        <div
          key={step}
          className={cn(
            "flex items-center gap-2 text-xs transition-colors",
            i < reached ? "text-muted-foreground" : i === reached ? "text-foreground" : "text-fg-dim",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full flex-shrink-0",
              i < reached ? "bg-primary" : i === reached ? "bg-primary motion-safe:animate-pulse" : "bg-line-strong",
            )}
          />
          {step}
        </div>
      ))}
    </div>
  );
}
