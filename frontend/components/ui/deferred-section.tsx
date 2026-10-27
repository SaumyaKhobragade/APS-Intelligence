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
  // Check if initially targeted by URL hash or if environment lacks IntersectionObserver
  const [shouldMount, setShouldMount] = React.useState(() => {
    if (typeof window === "undefined") return false;
    if (!("IntersectionObserver" in window)) return true;
    return Boolean(id && window.location.hash === `#${id}`);
  });
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (shouldMount) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;

    // Anchor navigation: listen for hashchange to mount targeted section immediately
    const onHashChange = () => {
      if (id && window.location.hash === `#${id}`) {
        setShouldMount(true);
      }
    };
    window.addEventListener("hashchange", onHashChange);

    // Viewport proximity observation (400px ahead of viewport)
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldMount(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [id, shouldMount]);

  return (
    <div
      ref={containerRef}
      id={id}
      style={{ minHeight: shouldMount ? undefined : minHeight }}
      className={shouldMount ? undefined : "transition-opacity duration-200"}
    >
      {shouldMount ? (
        children
      ) : (
        <section
          aria-label={`Deferred section: ${placeholderTitle ?? "evidence"}`}
          className="flex h-80 items-center justify-center border-b border-line bg-surface/30 px-5 sm:px-8 lg:px-10"
        >
          <div className="text-center font-mono text-xs text-muted">
            <p className="uppercase tracking-[0.14em]">Pending viewport proximity</p>
            <p className="mt-1 text-[11px] text-muted/70">Scroll to inspect {placeholderTitle ?? "evidence"}</p>
          </div>
        </section>
      )}
    </div>
  );
}
