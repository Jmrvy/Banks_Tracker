import * as React from "react";
import { cn } from "@/lib/utils";

interface AmountInputProps extends Omit<React.ComponentProps<"input">, "type" | "onChange"> {
  value: string | number;
  onChange: (value: string) => void;
}

const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Replace comma with period for decimal separator compatibility
      const normalizedValue = e.target.value.replace(',', '.');
      onChange(normalizedValue);
    };

    return (
      <input
        type="text"
        inputMode="decimal"
        pattern="[0-9]*[.,]?[0-9]*"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        value={value}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
AmountInput.displayName = "AmountInput";

export { AmountInput };
