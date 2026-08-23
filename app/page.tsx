"use client";

import Link from "next/link";
import { useRef, useSyncExternalStore } from "react";
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
import BorderGlow from "./components/home/BorderGlow";
import Carousel, { type CarouselItem } from "./components/home/Carousel";
import HeroScrollShell from "./components/home/HeroScrollShell";
import HeroShaderBackground from "./components/home/HeroShaderBackground";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Carousel's `baseWidth` is a plain pixel prop rendered straight into an
// inline style, so a naive useState(lazyInitializer) here would compute
// 520 on the server and (correctly) something narrower on the client —
// but React's hydration doesn't force-patch a mismatched inline style, so
// the server's 520px would silently stick past hydration on any screen
// narrower than that, overflowing the viewport. useSyncExternalStore is
// the documented fix for exactly this "value only knowable on the
// client" shape (same pattern already used in ChatInterface.tsx for its
// example prompts): the server snapshot (520, matching SSR) is used for
// hydration itself, then React re-checks the real snapshot immediately
// after and reconciles it as an ordinary update — no manual effect,
// no mismatch.
function subscribeToResize(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}
function getCarouselWidthSnapshot() {
  return Math.min(340, window.innerWidth - 48);
}
function getServerCarouselWidth() {
  return 340;
}

// Darker variants of Aurora's own hues (AuroraBackground.tsx uses
// indigo-500/violet-500/pink-400 — no blue). Deliberately one step darker
// (the 600-weight) than the hero blobs themselves: at the blobs' own
// lightness the glow read as a pale wash, especially in light mode. Same
// hue family, richer tone, in both themes (the glow doesn't switch per
// theme, so darkening it here fixes both at once).
const GLOW_COLORS = ["#4f46e5", "#db2777", "#7c3aed"];
const GLOW_HSL = "262 83 58"; // violet-600, for BorderGlow's outer edge-light halo

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

const STEPS: CarouselItem[] = [
  {
    id: 1,
    icon: <HelpCircleIcon className="carousel-icon" />,
    title: "Ask",
    description: "Bring a question, a topic, or a whole set of notes.",
  },
  {
    id: 2,
    icon: <BrainIcon className="carousel-icon" />,
    title: "Understand",
    description: "Get explanations that break it down until it clicks.",
  },
  {
    id: 3,
    icon: <TrophyIcon className="carousel-icon" />,
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

  const carouselWidth = useSyncExternalStore(
    subscribeToResize,
    getCarouselWidthSnapshot,
    getServerCarouselWidth,
  );

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

  return (
    // `overflow-x-clip` (not -hidden — clip never creates a scroll
    // container, so it can't disable `position: sticky` for anything)
    // contains BorderGlow's outer-glow bleed: `.edge-light` deliberately
    // extends past its card/button via a negative inset to render the
    // halo, which pushes a few pixels past the true viewport edge for any
    // card sitting flush against it. `<main>` is a sibling of the root
    // layout's sticky header, not an ancestor of it, so this can't affect
    // the header's own stickiness either way.
    <main className="flex flex-1 flex-col overflow-x-clip pb-24">
        {/* Hero — opens fullscreen and settles into a contained card as
            the user scrolls past it; see HeroScrollShell for the
            technique. */}
        <HeroScrollShell>
          <section
            ref={heroRef}
            className="relative flex h-full flex-col items-center justify-center gap-6 overflow-hidden px-6 py-28 text-center sm:py-36"
          >
            <HeroShaderBackground />

            <span
              ref={heroEyebrowRef}
              className="rounded-full border border-border px-4 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              AI Study Companion
            </span>

            <h1
              ref={heroHeadingRef}
              className="max-w-3xl text-5xl font-semibold tracking-tight text-balance text-foreground sm:text-6xl"
            >
              Learn smarter with{" "}
              <span className="font-wordmark text-4xl sm:text-5xl">
                Lumora
              </span>
              .
            </h1>

            <p
              ref={heroDescriptionRef}
              className="max-w-xl text-lg text-balance text-muted-foreground"
            >
              Lumora is an AI study companion that explains concepts clearly,
              quizzes you on what you&apos;ve learned, and helps it stick.
            </p>

            <div ref={heroCtaRef}>
              <BorderGlow
                className="group/cta border-glow-button"
                edgeSensitivity={15}
                glowColor={GLOW_HSL}
                backgroundColor="transparent"
                borderRadius={14}
                glowRadius={18}
                glowIntensity={0.65}
                coneSpread={30}
                animated={false}
                colors={GLOW_COLORS}
                fillOpacity={0.2}
              >
                <Button
                  asChild
                  size="lg"
                  className="h-12 gap-2 rounded-xl px-6 text-base font-semibold motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.03] active:scale-[0.98]"
                >
                  <Link href="/generate">
                    Start studying
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="size-4 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:group-hover/cta:translate-x-0.5"
                    />
                  </Link>
                </Button>
              </BorderGlow>
            </div>
          </section>
        </HeroScrollShell>

        {/* Feature cards */}
        <section className="px-6 py-20 sm:py-24">
          <div className="mx-auto flex max-w-5xl flex-col gap-10">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Everything you need to study smarter
            </h2>

            <div ref={featuresRef} className="grid gap-4 sm:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <BorderGlow
                  key={title}
                  className="group backdrop-blur-md"
                  edgeSensitivity={30}
                  glowColor={GLOW_HSL}
                  backgroundColor="color-mix(in oklch, var(--card) 72%, transparent)"
                  borderRadius={20}
                  glowRadius={32}
                  glowIntensity={0.65}
                  coneSpread={25}
                  animated={false}
                  colors={GLOW_COLORS}
                  fillOpacity={0.22}
                >
                  <div className="flex flex-col gap-3 p-6">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-foreground transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon aria-hidden="true" className="size-5" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">
                      {title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </BorderGlow>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 py-20 sm:py-24">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-10">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              How it works
            </h2>

            <Carousel
              items={STEPS}
              baseWidth={carouselWidth}
              autoplay={false}
              pauseOnHover
              loop
              round
            />
          </div>
        </section>

        {/* Final CTA */}
        <section className="flex flex-col items-center gap-4 px-6 py-24 text-center sm:py-28">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Ready to study?
          </h2>
          <p className="max-w-md text-lg text-muted-foreground">
            Your next breakthrough is one question away.
          </p>
          <BorderGlow
            className="group/cta border-glow-button mt-2"
            edgeSensitivity={15}
            glowColor={GLOW_HSL}
            backgroundColor="transparent"
            borderRadius={14}
            glowRadius={18}
            glowIntensity={0.65}
            coneSpread={30}
            animated={false}
            colors={GLOW_COLORS}
            fillOpacity={0.2}
          >
            <Button
              asChild
              size="lg"
              className="h-12 gap-2 rounded-xl px-6 text-base font-semibold motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.03] active:scale-[0.98]"
            >
              <Link href="/generate">
                Start studying
                <ArrowRightIcon
                  aria-hidden="true"
                  className="size-4 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:group-hover/cta:translate-x-0.5"
                />
              </Link>
            </Button>
          </BorderGlow>
        </section>
      </main>
  );
}
