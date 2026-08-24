"use client";

import Link from "next/link";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  BookOpenIcon,
  CompassIcon,
  HistoryIcon,
  LightbulbIcon,
  MessageCircleQuestionIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DeveloperCredit from "./components/DeveloperCredit";

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

// The concrete answer to "what does Lumora actually do" — each card names
// a real route rather than a vague capability, and links straight to it.
const FEATURES = [
  {
    icon: MessageCircleQuestionIcon,
    title: "Generate",
    description:
      "Ask about any topic and get a quiz or flashcard set built on the spot, tailored to what you're studying.",
    href: "/generate",
    linkLabel: "Open Generate",
  },
  {
    icon: CompassIcon,
    title: "Explore",
    description:
      "Every topic you study becomes part of your own knowledge graph, so you can see how it all connects.",
    href: "/explore",
    linkLabel: "Open Explore",
  },
  {
    icon: HistoryIcon,
    title: "History",
    description:
      "Every conversation is saved, so you can pick up exactly where you left off, whenever you come back.",
    href: "/history",
    linkLabel: "Open History",
  },
];

export default function AboutPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const introCardRef = useRef<HTMLDivElement>(null);
  const principlesRef = useRef<HTMLDivElement>(null);
  const featuresHeadingRef = useRef<HTMLHeadingElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const developedByRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  // One-time entrance: heading -> subtitle -> intro card -> principle cards
  // (staggered together) -> "what it does" heading -> feature cards
  // (staggered) -> developed-by card -> CTA. Short fade + small upward
  // move, same recipe as Home/History/Settings. `clearProps: "all"` on
  // every tween so GSAP's inline transforms don't linger and block the
  // CTA's/cards' CSS hover transitions afterward.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (
        !titleRef.current ||
        !subtitleRef.current ||
        !introCardRef.current ||
        !principlesRef.current ||
        !featuresHeadingRef.current ||
        !featuresRef.current ||
        !developedByRef.current ||
        !ctaRef.current
      ) {
        return;
      }

      const principleCards = Array.from(principlesRef.current.children);
      const featureCards = Array.from(featuresRef.current.children);

      gsap
        .timeline({
          defaults: { ease: "power2.out", duration: 0.26, clearProps: "all" },
        })
        .from(titleRef.current, { opacity: 0, y: 12 }, 0)
        .from(subtitleRef.current, { opacity: 0, y: 8 }, 0.1)
        .from(introCardRef.current, { opacity: 0, y: 12 }, 0.18)
        .from(principleCards, { opacity: 0, y: 14, stagger: 0.04 }, 0.26)
        .from(featuresHeadingRef.current, { opacity: 0, y: 10 }, 0.42)
        .from(featureCards, { opacity: 0, y: 14, stagger: 0.04 }, 0.48)
        .from(developedByRef.current, { opacity: 0, y: 12 }, 0.64)
        .from(ctaRef.current, { opacity: 0, y: 8 }, 0.72);
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

        <div className="flex w-full flex-col gap-4">
          <h2 className="text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Why Lumora
          </h2>

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
                <h3 className="text-sm font-semibold text-foreground">
                  {title}
                </h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col gap-4">
          <h2
            ref={featuresHeadingRef}
            className="text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            What Lumora does
          </h2>

          <div ref={featuresRef} className="grid w-full gap-4 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description, href, linkLabel }) => (
              <Link
                key={title}
                href={href}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors duration-150 ease-out hover:border-primary/40"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <Icon aria-hidden="true" className="size-4" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  {title}
                </h3>
                <p className="text-sm text-muted-foreground">{description}</p>
                <span className="mt-auto text-xs font-medium text-primary opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100">
                  {linkLabel} &rarr;
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col gap-4">
          <h2 className="text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Developed by
          </h2>

          <div ref={developedByRef} className="w-full">
            <DeveloperCredit />
          </div>
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
