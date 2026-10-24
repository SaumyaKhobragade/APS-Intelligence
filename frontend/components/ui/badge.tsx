import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "signal" | "success" | "warning" | "dark";

const badgeVariants: Record<BadgeVariant, string> = {
  neutral: "border-line bg-canvas-deep text-ink-soft",
  signal: "border-signal/20 bg-signal-wash text-signal-deep",
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/20 bg-warning/10 text-warning",
  dark: "border-charcoal bg-charcoal text-white",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em]",
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
