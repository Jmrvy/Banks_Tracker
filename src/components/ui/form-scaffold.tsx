import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<Size, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
};

interface FormScaffoldProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title in the dialog header. */
  title: React.ReactNode;
  /** Optional subtitle / description shown under the title. */
  description?: React.ReactNode;
  /** Width breakpoint of the dialog. Defaults to `md`. */
  size?: Size;
  /**
   * If supplied, the dialog renders a sticky footer with a Cancel button
   * and a primary Submit button. The submit button activates a form by
   * `formId` so the form can sit anywhere in `children`.
   */
  submit?: {
    formId: string;
    label: React.ReactNode;
    pendingLabel?: React.ReactNode;
    pending?: boolean;
    disabled?: boolean;
  };
  /** Custom footer content. When set, replaces the default cancel/submit row. */
  footer?: React.ReactNode;
  /** Cancel-button label (default: "Cancel" / "Annuler" via i18n in caller). */
  cancelLabel?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared scaffold for form-style modals. Codifies the project's
 * dialog-pattern (see CLAUDE.md): full-bleed content with a sticky header,
 * scrollable body, and sticky footer. Caller passes the form fields as
 * `children`; the scaffold owns chrome, sizing, and button wiring.
 *
 * For read-mostly detail surfaces use `<DetailSheet>` instead.
 */
export function FormScaffold({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  submit,
  footer,
  cancelLabel,
  children,
}: FormScaffoldProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[95vw] max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0",
          sizeClasses[size]
        )}
      >
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0 border-b border-line">
          <DialogTitle className="text-sm sm:text-lg">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>

        {footer ? (
          <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t border-line">
            {footer}
          </div>
        ) : submit ? (
          <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t border-line">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs sm:text-sm"
            >
              {cancelLabel ?? "Cancel"}
            </Button>
            <Button
              type="submit"
              form={submit.formId}
              disabled={submit.pending || submit.disabled}
              className="h-9 text-xs sm:text-sm flex-1 sm:flex-initial"
            >
              {submit.pending ? (submit.pendingLabel ?? submit.label) : submit.label}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
