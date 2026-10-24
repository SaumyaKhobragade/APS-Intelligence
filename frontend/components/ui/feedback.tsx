import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ErrorStateProps {
  title?: string;
  description: string;
  onRetry?: () => void;
}

function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <Inbox aria-hidden="true" className="mb-4 size-6 text-muted" strokeWidth={1.5} />
      <h3 className="font-display text-2xl text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>
      {actionLabel && onAction ? (
        <Button className="mt-5" size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function ErrorState({ title = "Something went wrong", description, onRetry }: ErrorStateProps) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center border border-signal/25 bg-signal-wash px-6 py-10 text-center">
      <AlertTriangle aria-hidden="true" className="mb-4 size-6 text-signal" strokeWidth={1.5} />
      <h3 className="font-display text-2xl text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">{description}</p>
      {onRetry ? (
        <Button className="mt-5" size="sm" variant="signal" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export { EmptyState, ErrorState };
