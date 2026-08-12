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

// Route-level boundary for app/generate — catches rendering errors thrown
// by page.tsx or anything under it (ChatInterface, GSAP, Streamdown, …)
// that a local try/catch can't reach. Scoped to this segment only: the
// root layout's navbar/footer live above it in the tree and keep
// rendering normally underneath this fallback.
export default function GenerateError({
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
    console.error("[generate/error]", error);
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
        className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-card p-6 text-center dark:border-zinc-800"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400">
          <CircleAlertIcon aria-hidden="true" className="size-5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          We couldn&apos;t load this part of Lumora. Try again, or refresh
          the page if it keeps happening.
        </p>
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
