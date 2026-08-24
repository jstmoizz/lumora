"use client";

import { useEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CircleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Root-segment boundary — catches rendering errors anywhere under the root
// layout that a more specific segment boundary (e.g. app/generate/error.tsx)
// doesn't already own (e.g. app/page.tsx, or any route with no error.tsx of
// its own). Per Next's error.js contract, this does NOT wrap the root
// layout.tsx in the same segment — only `children` — so the header/footer
// keep rendering normally above this fallback, same as generate/error.tsx.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Logged for local diagnosis only — never rendered, so nothing about
    // the underlying failure (message, stack, digest) reaches the user.
    console.error("[app/error]", error);
  }, [error]);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !cardRef.current) return;
      gsap.from(cardRef.current, {
        opacity: 0,
        y: 10,
        duration: 0.35,
        ease: "power2.out",
        clearProps: "all",
      });
    },
    { scope: cardRef, dependencies: [] },
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6">
      <div
        ref={cardRef}
        className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <CircleAlertIcon aria-hidden="true" className="size-5" />
        </div>
        {/*
          This boundary replaces the page's content with no navigation to
          cue a screen reader user that something changed — `role="alert"`
          announces it the moment it mounts.
        */}
        <div role="alert" className="flex flex-col items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load this part of Lumora. Try again, or refresh
            the page if it keeps happening.
          </p>
        </div>
        <Button
          type="button"
          onClick={reset}
          className="mt-1 rounded-xl px-5 text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
        >
          Try again
        </Button>
      </div>
    </main>
  );
}
