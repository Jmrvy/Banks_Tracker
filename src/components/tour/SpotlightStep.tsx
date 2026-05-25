import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTour, ESSENTIAL_STEPS, CHECKLIST_STEPS } from "@/contexts/TourContext";
import { usePositionRect } from "./usePositionRect";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TourStep } from "./tour-config";
import "./tour.css";

const PAD = 8;
const GAP = 12;

function computeTooltipPosition(
  rect: { top: number; left: number; width: number; height: number },
  placement: TourStep["placement"] = "bottom",
  size: { w: number; h: number },
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const placements: TourStep["placement"][] = [placement, "bottom", "top", "right", "left"];

  for (const p of placements) {
    let top = 0, left = 0;
    if (p === "bottom") {
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - size.w / 2;
    } else if (p === "top") {
      top = rect.top - size.h - GAP;
      left = rect.left + rect.width / 2 - size.w / 2;
    } else if (p === "right") {
      top = rect.top + rect.height / 2 - size.h / 2;
      left = rect.left + rect.width + GAP;
    } else if (p === "left") {
      top = rect.top + rect.height / 2 - size.h / 2;
      left = rect.left - size.w - GAP;
    }
    const cTop = Math.max(12, Math.min(top, vh - size.h - 12));
    const cLeft = Math.max(12, Math.min(left, vw - size.w - 12));
    if (Math.abs(cTop - top) < 16 && Math.abs(cLeft - left) < 16) {
      return { top: cTop, left: cLeft };
    }
  }
  const top = Math.max(12, Math.min(rect.top + rect.height + GAP, vh - size.h - 12));
  const left = Math.max(12, Math.min(rect.left + rect.width / 2 - size.w / 2, vw - size.w - 12));
  return { top, left };
}

function useResolveStep(): TourStep | null {
  const { state } = useTour();
  if (state.phase === "essentials") return ESSENTIAL_STEPS[state.essentialIdx] ?? null;
  if (state.phase === "checklist" && state.activeChecklistId)
    return CHECKLIST_STEPS.find((s) => s.id === state.activeChecklistId) ?? null;
  return null;
}

export function SpotlightStep() {
  const { t } = useTranslation();
  const { state, next, prev, skipStep, skipAll, dismissActive } = useTour();
  const step = useResolveStep();
  const navigate = useNavigate();
  const location = useLocation();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const autoSkipTimer = useRef<number | null>(null);
  const navigationTimer = useRef<number | null>(null);
  const [isNavigatingToStep, setIsNavigatingToStep] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!step) return;
    const needPath = step.route && location.pathname !== step.route;
    const needSearch = step.search && location.search !== step.search;
    if (needPath || needSearch) {
      setIsNavigatingToStep(true);
      navigate(`${step.route ?? location.pathname}${step.search ?? ""}`);
      return;
    }
    if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
    navigationTimer.current = window.setTimeout(() => setIsNavigatingToStep(false), 350);
    return () => {
      if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
    };
  }, [step, location.pathname, location.search, navigate]);

  const rect = usePositionRect(step?.selector ?? null, [step?.id, location.pathname]);

  useEffect(() => {
    if (!step || isNavigatingToStep) return;
    if (rect) {
      if (autoSkipTimer.current) {
        window.clearTimeout(autoSkipTimer.current);
        autoSkipTimer.current = null;
      }
      return;
    }
    autoSkipTimer.current = window.setTimeout(() => {
      if (state.phase === "essentials") next();
      else dismissActive();
    }, 2500);
    return () => {
      if (autoSkipTimer.current) window.clearTimeout(autoSkipTimer.current);
    };
  }, [rect, step, state.phase, next, dismissActive, isNavigatingToStep]);

  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (state.phase === "essentials") skipStep();
        else dismissActive();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (state.phase === "essentials") next();
        else dismissActive();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (state.phase === "essentials") prev();
      } else if (e.key === "Tab") {
        const root = tooltipRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, state.phase, next, prev, skipStep, dismissActive]);

  useEffect(() => {
    if (tooltipRef.current) tooltipRef.current.focus();
    if (step) {
      try {
        window.dispatchEvent(
          new CustomEvent("tour:event", {
            detail: { type: "step_view", stepId: step.id, phase: state.phase },
          }),
        );
      } catch {
        /* noop */
      }
    }
  }, [step?.id, state.phase]);

  const padded = useMemo(() => {
    if (!rect) return null;
    return {
      top: Math.max(0, rect.top - PAD),
      left: Math.max(0, rect.left - PAD),
      width: rect.width + PAD * 2,
      height: rect.height + PAD * 2,
    };
  }, [rect]);

  if (!step) return null;

  const isEssential = state.phase === "essentials";
  const idx = isEssential ? state.essentialIdx : 0;
  const total = isEssential ? ESSENTIAL_STEPS.length : 1;

  const tipTitle = t(`tour.tips.${step.id}.title`, { defaultValue: step.id });
  const tipBody = t(`tour.tips.${step.id}.body`, { defaultValue: "" });

  const scrimStyle = padded
    ? ({
        ["--tour-x" as string]: `${padded.left}px`,
        ["--tour-y" as string]: `${padded.top}px`,
        ["--tour-w" as string]: `${padded.width}px`,
        ["--tour-h" as string]: `${padded.height}px`,
      } as React.CSSProperties)
    : undefined;

  // ── Mobile: bottom-sheet card ────────────────────────────────────────────
  if (isMobile) {
    return createPortal(
      <>
        <div
          className="tour-scrim"
          style={scrimStyle}
          onClick={() => (isEssential ? skipStep() : dismissActive())}
          aria-hidden="true"
        />
        {padded && (
          <div
            className="tour-ring"
            style={{
              top: padded.top,
              left: padded.left,
              width: padded.width,
              height: padded.height,
            }}
            aria-hidden="true"
          />
        )}
        <div
          ref={tooltipRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-tip-title"
          tabIndex={-1}
          className="tour-bottom-card"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />

          {/* Progress dots for essential steps */}
          {isEssential && (
            <div className="flex justify-center gap-1.5 mb-3">
              {ESSENTIAL_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === idx
                      ? "w-5 bg-primary"
                      : i < idx
                      ? "w-1.5 bg-primary/40"
                      : "w-1.5 bg-muted-foreground/25"
                  }`}
                />
              ))}
            </div>
          )}

          {/* Eyebrow label */}
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            {isEssential
              ? t("tour.essentialStep", {
                  current: idx + 1,
                  total,
                  defaultValue: `Step ${idx + 1} of ${total}`,
                })
              : t("tour.tipLabel", { defaultValue: "Tip" })}
          </div>

          <h3 id="tour-tip-title" className="text-[17px] font-semibold leading-snug mb-1.5">
            {tipTitle}
          </h3>
          {tipBody && (
            <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">{tipBody}</p>
          )}

          {/* Action row */}
          {isEssential ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={skipAll}
                className="text-[13px] text-muted-foreground py-2.5 px-1 shrink-0"
              >
                {t("tour.skipAll", { defaultValue: "Skip" })}
              </button>
              <div className="flex-1" />
              {idx > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prev}
                  className="h-11 w-11 p-0 shrink-0"
                  aria-label={t("common.previous", { defaultValue: "Previous" })}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              )}
              <Button size="sm" onClick={next} className="h-11 px-5 gap-1 min-w-[110px]">
                {idx === ESSENTIAL_STEPS.length - 1
                  ? t("tour.openChecklist", { defaultValue: "Open checklist" })
                  : t("common.next", { defaultValue: "Next" })}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={dismissActive}
                className="text-[13px] text-muted-foreground py-2.5 px-1 shrink-0"
              >
                {t("tour.markDone", { defaultValue: "Mark as seen" })}
              </button>
              <Button size="sm" onClick={dismissActive} className="flex-1 h-11">
                {t("common.gotIt", { defaultValue: "Got it" })}
              </Button>
            </div>
          )}
        </div>
      </>,
      document.body,
    );
  }

  // ── Desktop: floating tooltip ────────────────────────────────────────────
  const SIZE = { w: 360, h: 180 };
  const pos = padded
    ? computeTooltipPosition(padded, step.placement, SIZE)
    : { top: window.innerHeight / 2 - 90, left: window.innerWidth / 2 - 180 };

  return createPortal(
    <>
      <div
        className="tour-scrim"
        style={scrimStyle}
        onClick={() => (isEssential ? skipStep() : dismissActive())}
        aria-hidden="true"
      />
      {padded && (
        <div
          className="tour-ring"
          style={{
            top: padded.top,
            left: padded.left,
            width: padded.width,
            height: padded.height,
          }}
          aria-hidden="true"
        />
      )}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-tip-title"
        tabIndex={-1}
        className="tour-tooltip"
        style={{ top: pos.top, left: pos.left, width: SIZE.w }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            {isEssential
              ? t("tour.essentialStep", {
                  current: idx + 1,
                  total,
                  defaultValue: `Step ${idx + 1} of ${total}`,
                })
              : t("tour.tipLabel", { defaultValue: "Tip" })}
          </div>
          <button
            type="button"
            aria-label={t("common.close", { defaultValue: "Close" })}
            onClick={() => (isEssential ? skipAll() : dismissActive())}
            className="text-muted-foreground hover:text-foreground -mt-0.5 -mr-1 p-1 rounded-md hover:bg-muted/50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <h3 id="tour-tip-title" className="text-[15px] font-semibold leading-tight mb-1.5">
          {tipTitle}
        </h3>
        {tipBody && (
          <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">{tipBody}</p>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          {isEssential ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={skipAll}
                className="h-8 px-2 text-[12px] text-muted-foreground"
              >
                {t("tour.skipAll", { defaultValue: "Skip tour" })}
              </Button>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prev}
                  disabled={idx === 0}
                  className="h-8 w-8 p-0"
                  aria-label={t("common.previous", { defaultValue: "Previous" })}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={next} className="h-8 px-3 text-[12px] gap-1">
                  {idx === ESSENTIAL_STEPS.length - 1
                    ? t("tour.openChecklist", { defaultValue: "Open checklist" })
                    : t("common.next", { defaultValue: "Next" })}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={dismissActive}
                className="h-8 px-2 text-[12px] text-muted-foreground"
              >
                {t("tour.markDone", { defaultValue: "Mark as seen" })}
              </Button>
              <Button size="sm" onClick={dismissActive} className="h-8 px-3 text-[12px]">
                {t("common.gotIt", { defaultValue: "Got it" })}
              </Button>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
