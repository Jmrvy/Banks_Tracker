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
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content
          className={cn(
            "fixed z-50 bg-card text-card-foreground border-line shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300 flex flex-col overflow-hidden",
            isMobile
              ? "inset-x-0 bottom-0 rounded-t-2xl border-t h-[92vh] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
              : "inset-y-0 right-0 h-full w-full sm:max-w-[480px] border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
          )}
        >
          {isMobile && (
            <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>
          )}
          {children}
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
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
      "px-5 pt-5 pb-3 sm:px-6 sm:pt-6 border-b border-line flex-shrink-0",
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
    className={cn("text-base sm:text-lg font-semibold text-foreground flex items-center gap-2", className)}
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
    className={cn("text-xs sm:text-sm text-muted-foreground mt-0.5", className)}
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
    className={cn("flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-4", className)}
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
      "px-5 py-3 sm:px-6 sm:py-4 border-t border-line flex flex-wrap gap-2 flex-shrink-0",
      className
    )}
    {...props}
  />
));
DetailSheetFooter.displayName = "DetailSheetFooter";
