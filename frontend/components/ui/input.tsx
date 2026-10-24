import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full border border-line-strong bg-surface px-3 font-sans text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-signal disabled:cursor-not-allowed disabled:bg-canvas-deep disabled:opacity-70",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
