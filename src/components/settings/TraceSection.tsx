import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TraceMark } from "@/components/trace/TraceMark";
import { useTrace, type TraceAgency } from "@/contexts/TraceContext";
import { useTraceSettings } from "@/hooks/useTraceSettings";
import { useToast } from "@/hooks/use-toast";

/** OpenRouter quotes per token; per-million is how people compare models. */
const perMillion = (price: number) => `$${(price * 1_000_000).toFixed(2)}`;

/**
 * Everything Trace needs to run, in one place: the key that pays for it,
 * the model it runs on, how hard it thinks, and what it's allowed to do.
 *
 * The key is write-only — the field is always empty on load and the stored
 * key is represented by its last characters. There is no path that returns
 * it to the browser, so there is nothing here to leak.
 */
export const TraceSection = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { agency, setAgency } = useTrace();
  const { status, models, loading, saving, available, loadModels, save, remove } = useTraceSettings();

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState<string>("");
  const [effort, setEffort] = useState<"low" | "medium" | "high">("medium");
  const [modelsLoading, setModelsLoading] = useState(false);

  // Mirror the server's view once it arrives; the form is otherwise
  // uncontrolled by it, so a user's in-progress edits are never clobbered
  // by a refresh.
  useEffect(() => {
    if (!status) return;
    setModel(status.model);
    setEffort(status.reasoning_effort);
  }, [status]);

  const managedByDeployment = status?.source === "env";

  const onLoadModels = async () => {
    setModelsLoading(true);
    const list = await loadModels();
    setModelsLoading(false);
    if (list.length === 0) {
      toast({
        title: t("settings.traceModelsFailed", { defaultValue: "Could not load models" }),
        description: t("settings.traceModelsFailedDesc", {
          defaultValue: "Check the API key, then try again.",
        }),
        variant: "destructive",
      });
    }
  };

  const onSave = async () => {
    const res = await save({
      apiKey: apiKey.trim() || undefined,
      model: model || null,
      reasoningEffort: effort,
    });
    if (res.ok) {
      setApiKey("");
      setShowKey(false);
      toast({
        title: t("settings.traceSaved", { defaultValue: "Trace configured" }),
        description: res.label
          ? t("settings.traceSavedKey", { defaultValue: "Key verified: {{label}}", label: res.label })
          : t("settings.traceSavedDesc", { defaultValue: "Your changes are live." }),
      });
      return;
    }
    const reason =
      res.reason === "rejected"
        ? t("settings.traceKeyRejected", { defaultValue: "OpenRouter rejected that key." })
        : res.reason === "unreachable"
          ? t("settings.traceKeyUnreachable", {
              defaultValue: "Could not reach OpenRouter to verify the key.",
            })
          : res.reason === "no_key"
            ? t("settings.traceNoKey", { defaultValue: "Add an API key first." })
            : res.reason === "unavailable"
              ? t("settings.traceUnavailableShort", {
                  defaultValue: "Trace's backend isn't deployed on this project yet.",
                })
              : t("errors.updateError", { defaultValue: "Could not save" });
    toast({ title: t("common.error", { defaultValue: "Error" }), description: reason, variant: "destructive" });
  };

  const onRemove = async () => {
    if (await remove()) {
      setApiKey("");
      toast({ title: t("settings.traceKeyRemoved", { defaultValue: "API key removed" }) });
    }
  };

  return (
    <div className="ft-card">
      <div className="ft-card-head">
        <div>
          <div className="flex items-center gap-2">
            {/* The same 30px accent tile every settings card head carries,
                with Trace's own mark inside it. */}
            <div className="ft-kpi-icon acc">
              <TraceMark plain glyphSize={15} className="h-[15px] w-[15px] text-accent-deep" />
            </div>
            <h3 className="ft-card-title text-base">
              {t("settings.traceSection", { defaultValue: "Trace copilot" })}
            </h3>
          </div>
          <p className="ft-card-sub mt-1">
            {t("settings.traceSubtitle", {
              defaultValue:
                "Trace runs on your own OpenRouter account, so you choose the model and you see the bill.",
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* The form is useless until the function behind it exists. Say so
            up front rather than letting Save be the thing that finds out. */}
        {!available && !loading && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3"
          >
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/90">
              {t("settings.traceUnavailable", {
                defaultValue:
                  "Trace's settings service isn't deployed on this Supabase project yet, so nothing here can be saved. It ships with the rest of the Trace copilot.",
              })}
            </p>
          </div>
        )}

        {/* API key */}
        <div className="space-y-1.5">
          <Label htmlFor="trace-key" className="text-sm flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            {t("settings.traceApiKey", { defaultValue: "OpenRouter API key" })}
          </Label>

          {loading ? (
            <div className="h-9 rounded-md bg-bg-subtle animate-pulse" />
          ) : managedByDeployment ? (
            <p className="text-xs text-muted-foreground">
              {t("settings.traceKeyFromDeployment", {
                defaultValue:
                  "A key is configured for this deployment. Add your own below to use it instead.",
              })}
            </p>
          ) : status?.configured && status.hint ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg-subtle px-2.5 py-1.5 text-xs font-mono">
                <Check className="h-3.5 w-3.5 text-pos" />
                sk-or-…{status.hint.replace(/^…/, "")}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                disabled={saving}
                className="h-8 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {t("settings.traceRemoveKey", { defaultValue: "Remove" })}
              </Button>
            </div>
          ) : null}

          <div className="relative">
            <Input
              id="trace-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                status?.configured
                  ? t("settings.traceReplaceKey", { defaultValue: "Paste a new key to replace it" })
                  : "sk-or-v1-…"
              }
              autoComplete="off"
              spellCheck={false}
              className="h-9 text-sm font-mono pr-9"
            />
            {apiKey && (
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={
                  showKey
                    ? t("settings.traceHideKey", { defaultValue: "Hide key" })
                    : t("settings.traceShowKey", { defaultValue: "Show key" })
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {t("settings.traceApiKeyHint", {
              defaultValue:
                "Stored server-side, never sent back to your browser and unreadable by any client session — only the last characters are shown.",
            })}{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
            >
              {t("settings.traceGetKey", { defaultValue: "Get a key" })}
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>

        <div className="border-t border-line" />

        {/* Model */}
        <div className="space-y-1.5">
          <Label className="text-sm">{t("settings.traceModel", { defaultValue: "Model" })}</Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.traceModelDesc", {
              defaultValue:
                "Only models that support tool calling are listed — Trace answers by calling tools, so the rest can't work.",
            })}
          </p>
          {models ? (
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-9 text-sm w-full sm:w-[420px] mt-1">
                <SelectValue placeholder={t("settings.traceModelPick", { defaultValue: "Pick a model" })} />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-baseline gap-2">
                      <span>{m.name}</span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {perMillion(m.prompt_price)} / {perMillion(m.completion_price)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <code className="text-xs font-mono bg-bg-subtle border border-line rounded px-2 py-1.5">
                {model || t("settings.traceModelNone", { defaultValue: "not set" })}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onLoadModels}
                disabled={modelsLoading || !status?.configured}
              >
                {modelsLoading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                {t("settings.traceLoadModels", { defaultValue: "Browse models" })}
              </Button>
            </div>
          )}
        </div>

        {/* Reasoning effort */}
        <div className="space-y-1.5">
          <Label className="text-sm">
            {t("settings.traceEffort", { defaultValue: "Reasoning effort" })}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.traceEffortDesc", {
              defaultValue: "Higher thinks longer and costs more. Ignored by models that don't reason.",
            })}
          </p>
          <Select value={effort} onValueChange={(v: "low" | "medium" | "high") => setEffort(v)}>
            <SelectTrigger className="h-9 text-sm w-full sm:w-[240px] mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t("settings.traceEffortLow", { defaultValue: "Low — fastest" })}</SelectItem>
              <SelectItem value="medium">
                {t("settings.traceEffortMedium", { defaultValue: "Medium — balanced" })}
              </SelectItem>
              <SelectItem value="high">
                {t("settings.traceEffortHigh", { defaultValue: "High — most thorough" })}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border-t border-line" />

        {/* Agency — what Trace may do with what it proposes. */}
        <div className="space-y-1.5">
          <Label className="text-sm">
            {t("settings.traceAgency", { defaultValue: "What Trace may do" })}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.traceAgencyDesc", {
              defaultValue:
                "Trace always reads your ledger to answer questions. This controls what happens to the changes it proposes.",
            })}
          </p>
          <Select value={agency} onValueChange={(v: TraceAgency) => setAgency(v)}>
            <SelectTrigger className="h-9 text-sm w-full sm:w-[320px] mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read">
                {t("settings.traceAgencyRead", { defaultValue: "Read-only — never applies anything" })}
              </SelectItem>
              <SelectItem value="confirm">
                {t("settings.traceAgencyConfirm", { defaultValue: "Proposes — you confirm each change" })}
              </SelectItem>
              <SelectItem value="auto">
                {t("settings.traceAgencyAuto", { defaultValue: "Standing rules — applies on arrival" })}
              </SelectItem>
            </SelectContent>
          </Select>
          {agency === "auto" && (
            <p className="text-xs text-warning mt-1">
              {t("settings.traceAgencyAutoWarning", {
                defaultValue:
                  "Changes are written as soon as Trace proposes them. Every one is logged and reversible from Trace → Activity.",
              })}
            </p>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button
            onClick={onSave}
            disabled={saving || loading || !available}
            size="sm"
            className="h-9 font-semibold"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {t("common.save", { defaultValue: "Save" })}
          </Button>
        </div>
      </div>
    </div>
  );
};
