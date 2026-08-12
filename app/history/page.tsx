"use client";

import Link from "next/link";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HistoryPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const emptyDescriptionRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  // One-time cascading entrance: page title -> subtitle -> icon -> empty
  // state heading -> description -> CTA. Same short fade + upward-move
  // recipe as Home's hero and Generate's empty state, with `clearProps`
  // so GSAP's inline transforms don't linger and block the CTA's CSS
  // hover transform afterward.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (
        !titleRef.current ||
        !subtitleRef.current ||
        !iconRef.current ||
        !emptyHeadingRef.current ||
        !emptyDescriptionRef.current ||
        !ctaRef.current
      ) {
        return;
      }

      gsap
        .timeline({
          defaults: { ease: "power2.out", duration: 0.45, clearProps: "all" },
        })
        .from(titleRef.current, { opacity: 0, y: 12 })
        .from(subtitleRef.current, { opacity: 0, y: 10 }, "-=0.3")
        .from(iconRef.current, { opacity: 0, y: 14, scale: 0.94 }, "-=0.22")
        .from(emptyHeadingRef.current, { opacity: 0, y: 10 }, "-=0.26")
        .from(emptyDescriptionRef.current, { opacity: 0, y: 8 }, "-=0.28")
        .from(ctaRef.current, { opacity: 0, y: 8 }, "-=0.26");
    },
    { scope: pageRef, dependencies: [] },
  );

  return (
    <main
      ref={pageRef}
      className="flex flex-1 flex-col items-center px-6 py-16 sm:py-20"
    >
      <div className="flex w-full max-w-2xl flex-col items-center gap-2 text-center">
        <h1
          ref={titleRef}
          className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        >
          History
        </h1>
        <p
          ref={subtitleRef}
          className="text-sm text-zinc-500 dark:text-zinc-400"
        >
          Your study sessions, all in one place.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <div
          ref={iconRef}
          className="relative flex size-32 items-center justify-center"
        >
          {/*
            Small, static-position ambient glow behind the icon, reusing
            the same aurora-drift keyframes and indigo tone as Home's
            AuroraBackground for a consistent (but much smaller/calmer)
            ambient treatment. Purely decorative.
          */}
          <div
            aria-hidden="true"
            className="aurora-blob absolute inset-0 rounded-full bg-indigo-500/15 blur-2xl dark:bg-indigo-500/20"
          />
          <div className="relative z-10 flex size-16 items-center justify-center rounded-2xl border border-zinc-200 bg-card text-foreground dark:border-zinc-800">
            <HistoryIcon aria-hidden="true" className="size-7" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <h2
            ref={emptyHeadingRef}
            className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
          >
            No study sessions yet
          </h2>
          <p
            ref={emptyDescriptionRef}
            className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400"
          >
            Once you start studying with Lumora, your sessions will show up
            here so you can pick up where you left off.
          </p>
        </div>

        <div ref={ctaRef}>
          <Button
            asChild
            size="lg"
            className="h-11 gap-2 rounded-xl px-6 text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
          >
            <Link href="/generate">Start studying</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
