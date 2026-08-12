"use client";

import Link from "next/link";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRightIcon,
  BrainIcon,
  HelpCircleIcon,
  ListChecksIcon,
  MessageCircleQuestionIcon,
  RepeatIcon,
  TrophyIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AuroraBackground from "./components/home/AuroraBackground";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const FEATURES = [
  {
    icon: MessageCircleQuestionIcon,
    title: "Ask anything",
    description: "Get clear explanations tailored to what you're learning.",
  },
  {
    icon: ListChecksIcon,
    title: "Get quizzed",
    description: "Turn any topic into questions and test your understanding.",
  },
  {
    icon: RepeatIcon,
    title: "Learn continuously",
    description:
      "Keep your study sessions focused and build understanding over time.",
  },
];

const STEPS = [
  {
    icon: HelpCircleIcon,
    title: "Ask",
    description: "Bring a question, a topic, or a whole set of notes.",
  },
  {
    icon: BrainIcon,
    title: "Understand",
    description: "Get explanations that break it down until it clicks.",
  },
  {
    icon: TrophyIcon,
    title: "Master",
    description: "Quiz yourself and reinforce it until it sticks.",
  },
];

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const heroEyebrowRef = useRef<HTMLSpanElement>(null);
  const heroHeadingRef = useRef<HTMLHeadingElement>(null);
  const heroDescriptionRef = useRef<HTMLParagraphElement>(null);
  const heroCtaRef = useRef<HTMLDivElement>(null);

  const featuresRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);

  // One-time cascading entrance for the hero (eyebrow -> heading ->
  // description -> CTA), same pattern as the Generate page's empty state.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (
        !heroHeadingRef.current ||
        !heroDescriptionRef.current ||
        !heroCtaRef.current
      ) {
        return;
      }

      gsap
        .timeline({
          defaults: { ease: "power2.out", duration: 0.5, clearProps: "all" },
        })
        .from(heroEyebrowRef.current, { opacity: 0, y: 10 })
        .from(heroHeadingRef.current, { opacity: 0, y: 18 }, "-=0.3")
        .from(heroDescriptionRef.current, { opacity: 0, y: 14 }, "-=0.32")
        .from(heroCtaRef.current, { opacity: 0, y: 10 }, "-=0.28");
    },
    { scope: heroRef, dependencies: [] },
  );

  // Feature cards stagger in the first time the section crosses into view.
  useGSAP(
    () => {
      if (prefersReducedMotion() || !featuresRef.current) return;
      const cards = Array.from(featuresRef.current.children);

      gsap.from(cards, {
        opacity: 0,
        y: 24,
        duration: 0.5,
        ease: "power2.out",
        stagger: 0.12,
        clearProps: "all",
        scrollTrigger: {
          trigger: featuresRef.current,
          start: "top 80%",
          once: true,
        },
      });
    },
    { scope: featuresRef, dependencies: [] },
  );

  // "How it works" steps animate in on scroll, same once-only trigger.
  useGSAP(
    () => {
      if (prefersReducedMotion() || !stepsRef.current) return;
      const steps = Array.from(stepsRef.current.children);

      gsap.from(steps, {
        opacity: 0,
        y: 24,
        duration: 0.5,
        ease: "power2.out",
        stagger: 0.15,
        clearProps: "all",
        scrollTrigger: {
          trigger: stepsRef.current,
          start: "top 80%",
          once: true,
        },
      });
    },
    { scope: stepsRef, dependencies: [] },
  );

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section
        ref={heroRef}
        className="relative flex flex-col items-center justify-center gap-6 overflow-hidden px-6 py-28 text-center sm:py-36"
      >
        <AuroraBackground />

        <span
          ref={heroEyebrowRef}
          className="rounded-full border border-zinc-300 px-4 py-1 text-xs font-medium tracking-wide text-zinc-500 uppercase dark:border-zinc-700 dark:text-zinc-400"
        >
          AI Study Companion
        </span>

        <h1
          ref={heroHeadingRef}
          className="max-w-3xl text-5xl font-semibold tracking-tight text-balance text-foreground sm:text-6xl"
        >
          Learn smarter with Lumora.
        </h1>

        <p
          ref={heroDescriptionRef}
          className="max-w-xl text-lg text-balance text-zinc-600 dark:text-zinc-400"
        >
          Lumora is an AI study companion that explains concepts clearly,
          quizzes you on what you&apos;ve learned, and helps it stick.
        </p>

        <div ref={heroCtaRef}>
          <Button
            asChild
            size="lg"
            className="h-12 gap-2 rounded-xl px-6 text-base font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
          >
            <Link href="/generate">
              Start studying
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Feature cards */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto flex max-w-5xl flex-col gap-10">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Everything you need to study smarter
          </h2>

          <div ref={featuresRef} className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-card p-6 transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:border-zinc-300 hover:shadow-lg dark:border-zinc-800 dark:hover:border-zinc-600 dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_12px_32px_-8px_rgba(0,0,0,0.5)]"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-foreground transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon aria-hidden="true" className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {title}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto flex max-w-4xl flex-col gap-10">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            How it works
          </h2>

          <div ref={stepsRef} className="grid gap-8 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, description }, index) => (
              <div
                key={title}
                className="relative flex flex-col items-center gap-3 text-center"
              >
                {index < STEPS.length - 1 && (
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="absolute top-6 -right-4 hidden size-5 text-zinc-300 sm:block dark:text-zinc-700"
                  />
                )}
                <div className="flex size-12 items-center justify-center rounded-full border border-zinc-200 bg-card text-foreground dark:border-zinc-800">
                  <Icon aria-hidden="true" className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {title}
                </h3>
                <p className="max-w-56 text-sm text-zinc-500 dark:text-zinc-400">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="flex flex-col items-center gap-4 px-6 py-24 text-center sm:py-28">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Ready to study?
        </h2>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Your next breakthrough is one question away.
        </p>
        <Button
          asChild
          size="lg"
          className="mt-2 h-12 gap-2 rounded-xl px-6 text-base font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
        >
          <Link href="/generate">
            Start studying
            <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
      </section>
    </main>
  );
}
