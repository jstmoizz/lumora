"use client";

import Link from "next/link";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { BookOpenIcon, LightbulbIcon, TrendingUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const PRINCIPLES = [
  {
    icon: BookOpenIcon,
    title: "Learn",
    description:
      "Ask about anything you're studying and get explanations that actually make sense.",
  },
  {
    icon: LightbulbIcon,
    title: "Understand",
    description:
      "Work through concepts step by step until they click, not just once they're memorized.",
  },
  {
    icon: TrendingUpIcon,
    title: "Improve",
    description:
      "Check your understanding along the way, so every session builds real progress.",
  },
];

export default function AboutPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const introCardRef = useRef<HTMLDivElement>(null);
  const principlesRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  // One-time entrance: heading -> subtitle -> intro card -> principle cards
  // (staggered together) -> CTA. Short fade + small upward move, same
  // recipe as Home/History/Settings. `clearProps: "all"` on every tween so
  // GSAP's inline transforms don't linger and block the CTA's/cards' CSS
  // hover transitions afterward.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (
        !titleRef.current ||
        !subtitleRef.current ||
        !introCardRef.current ||
        !principlesRef.current ||
        !ctaRef.current
      ) {
        return;
      }

      const principleCards = Array.from(principlesRef.current.children);

      gsap
        .timeline({
          defaults: { ease: "power2.out", duration: 0.26, clearProps: "all" },
        })
        .from(titleRef.current, { opacity: 0, y: 12 }, 0)
        .from(subtitleRef.current, { opacity: 0, y: 8 }, 0.1)
        .from(introCardRef.current, { opacity: 0, y: 12 }, 0.18)
        .from(principleCards, { opacity: 0, y: 14, stagger: 0.04 }, 0.26)
        .from(ctaRef.current, { opacity: 0, y: 8 }, 0.4);
    },
    { scope: pageRef, dependencies: [] },
  );

  return (
    <main
      ref={pageRef}
      className="flex flex-1 flex-col items-center px-6 py-16 pb-24 sm:py-20"
    >
      <div className="flex w-full max-w-2xl flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1
            ref={titleRef}
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            About <span className="font-wordmark text-3xl sm:text-4xl">Lumora</span>
          </h1>
          <p
            ref={subtitleRef}
            className="max-w-md text-sm text-muted-foreground"
          >
            Lumora is an AI-powered study companion, built to help you learn
            with focus and clarity.
          </p>
        </div>

        <div
          ref={introCardRef}
          className="w-full rounded-xl border border-border bg-card p-6 sm:p-8"
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            Lumora is built around a simple idea: understanding something
            well takes more than reading it once. Ask a question, work
            through a concept, or check what you&apos;ve learned — Lumora
            meets you wherever you are, in one focused space instead of
            scattered notes and tabs.
          </p>
        </div>

        <div ref={principlesRef} className="grid w-full gap-4 sm:grid-cols-3">
          {PRINCIPLES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors duration-150 ease-out hover:border-primary/40"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-foreground">
                <Icon aria-hidden="true" className="size-4" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">
                {title}
              </h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>

        <div ref={ctaRef} className="flex flex-col items-center gap-4">
          <Button
            asChild
            size="lg"
            className="h-11 gap-2 rounded-xl px-6 text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
          >
            <Link href="/generate">Start studying</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            <span className="font-wordmark text-sm">Lumora</span> &middot;
            Study smarter.
          </p>
        </div>
      </div>
    </main>
  );
}
