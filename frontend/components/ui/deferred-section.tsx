"use client";

import * as React from "react";

interface DeferredSectionProps {
  children: React.ReactNode;
  id?: string;
  minHeight?: string;
  placeholderTitle?: string;
}

export function DeferredSection({
  children,
  id,
  minHeight = "360px",
  placeholderTitle,
}: DeferredSectionProps) {
  const [shouldMount, setShouldMount] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(id && window.location.hash === `#${id}`);
  });
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (shouldMount) return;

    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setShouldMount(true), 0);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldMount(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    const idleTimer = window.setTimeout(() => {
      setShouldMount(true);
    }, 1500);

    return () => {
      observer.disconnect();
      window.clearTimeout(idleTimer);
    };
  }, [shouldMount]);

  return (
    <div ref={containerRef} id={id} style={{ minHeight: shouldMount ? undefined : minHeight }}>
      {shouldMount ? (
        children
      ) : (
        <div className="flex h-72 items-center justify-center border-b border-line bg-surface/30 font-mono text-xs text-muted">
          Loading {placeholderTitle ?? "evidence"}…
        </div>
      )}
    </div>
  );
}
