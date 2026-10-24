import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, ...props }, ref) => (
    <div className="relative">
      <select
        className={cn(
          "flex h-10 w-full appearance-none border border-line-strong bg-surface px-3 pr-9 font-sans text-sm text-ink outline-none transition-colors focus:border-signal disabled:cursor-not-allowed disabled:bg-canvas-deep disabled:opacity-70",
          className,
        )}
        ref={ref}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
