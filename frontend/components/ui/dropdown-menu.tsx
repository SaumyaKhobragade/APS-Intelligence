"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  label: string;
  value: string;
  detail?: string;
}

interface DropdownMenuProps {
  label: string;
  options: DropdownOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

function DropdownMenu({
  label,
  options,
  value,
  onValueChange,
  className,
}: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        className="flex h-10 items-center gap-3 border border-line-strong bg-surface px-3 text-left text-sm text-ink transition-colors hover:border-charcoal"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      >
        <span className="min-w-20">
          <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            {label}
          </span>
          <span className="block font-medium">{selected?.label}</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 text-muted" />
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.35rem)] z-20 min-w-52 border border-line bg-surface p-1 shadow-xl">
          {options.map((option) => {
            const isSelected = option.value === selected?.value;

            return (
              <button
                key={option.value}
                type="button"
                className="flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left transition-colors hover:bg-canvas-deep"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onValueChange?.(option.value);
                  setOpen(false);
                }}
              >
                <span>
                  <span className="block text-sm font-medium text-ink">{option.label}</span>
                  {option.detail ? (
                    <span className="mt-0.5 block text-xs text-muted">{option.detail}</span>
                  ) : null}
                </span>
                {isSelected ? <Check aria-hidden="true" className="size-4 text-signal" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export { DropdownMenu };
