import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

/**
 * Responsive detail-pane primitive. Slides in from the right on desktop
 * (narrow ~480px panel) and from the bottom on mobile (full-screen sheet
 * with a rounded top). Used by detail/preview views — read-mostly screens
 * that show information about an entity and a few actions.
 *
 * Forms still use Dialog/FormScaffold; this is for "show me the record"
 * surfaces only.
 */
export function DetailSheet({ open, onOpenChange, children }: DetailSheetProps) {
  const isMobile = useIsMobile();

  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        {/* The scrim is a token (`--scrim`), tuned per theme and carrying its
            own alpha — same treatment as ui/sheet.tsx and ui/drawer.tsx. The
            design darkens the page behind a sheet but keeps it legible; there
            is no backdrop blur anywhere in the system. */}
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-[hsl(var(--scrim))] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content
          className={cn(
            "fixed z-50 bg-card text-card-foreground border-line transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300 flex flex-col overflow-hidden",
            isMobile
              ? // `ft-sheet` = the system's one bottom-sheet shoulder (26px top
                // radius + the level-3 shadow), matching MobileNavigation.
                "inset-x-0 bottom-0 ft-sheet border-t h-[92vh] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
              : "inset-y-0 right-0 h-full w-full sm:max-w-[480px] border-l shadow-sh-3 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
          )}
        >
          {/* Drag affordance — the system grab handle carries its own 9px/4px
              margins, so no wrapper is needed. */}
          {isMobile && <div className="ft-sheet-grab" aria-hidden="true" />}
          {children}
          <SheetPrimitive.Close className="absolute right-4 top-4 h-[29px] w-[29px] grid place-items-center rounded-[9px] text-fg-mute transition-colors hover:bg-bg-hover hover:text-foreground ft-focusable focus:outline-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}

export const DetailSheetHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Modal header canon; the body below scrolls, so it keeps a hairline —
      // `--line-soft`, the rule for splits inside a surface.
      "px-5 pt-5 pb-3 border-b border-line-soft flex-shrink-0",
      className
    )}
    {...props}
  />
));
DetailSheetHeader.displayName = "DetailSheetHeader";

export const DetailSheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-[15px] font-semibold tracking-tight text-foreground flex items-center gap-2", className)}
    {...props}
  />
));
DetailSheetTitle.displayName = SheetPrimitive.Title.displayName;

export const DetailSheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-xs text-fg-mute mt-0.5", className)}
    {...props}
  />
));
DetailSheetDescription.displayName = SheetPrimitive.Description.displayName;

export const DetailSheetBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex-1 overflow-y-auto px-5 py-4 space-y-4", className)}
    {...props}
  />
));
DetailSheetBody.displayName = "DetailSheetBody";

export const DetailSheetFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "px-5 py-3 border-t border-line-soft flex flex-wrap gap-2 flex-shrink-0",
      className
    )}
    {...props}
  />
));
DetailSheetFooter.displayName = "DetailSheetFooter";
