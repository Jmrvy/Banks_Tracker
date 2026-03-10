import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/90 text-primary-foreground shadow-[0_0_8px_-2px_hsl(38_70%_68%/0.25)] hover:bg-primary",
        secondary: "border-white/[0.06] bg-white/[0.06] backdrop-blur-sm text-secondary-foreground hover:bg-white/[0.10]",
        destructive: "border-transparent bg-destructive/90 text-destructive-foreground hover:bg-destructive",
        outline: "border-white/[0.10] text-foreground bg-white/[0.03] backdrop-blur-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
