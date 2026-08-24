"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
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
import SpecularButton from "./components/SpecularButton";
import { useIsDarkTheme } from "./components/useIsDarkTheme";
import BorderGlow from "./components/home/BorderGlow";
import Carousel, { type CarouselItem } from "./components/home/Carousel";
import HeroScrollShell from "./components/home/HeroScrollShell";
import HeroShaderBackground from "./components/home/HeroShaderBackground";
import type { WarpTextRun } from "./components/home/WarpText";

// Mirrors HERO_HEADLINE_RUNS below as real DOM text — real content inside
// the <h1>, not canvas-rasterized or hidden behind a role="img" trick.
// Typography matches the real WarpText's props so swapping to the animated
// version causes no layout shift. `--foreground`, not WarpText's own
// useIsDarkTheme()-resolved color, since this renders before hydration can
// run any hook — the CSS variable already resolves correctly via ThemeScript.
function HeroHeadlineFallback() {
  return (
    <span
      style={{
        display: "flex",
        minHeight: "clamp(140px, 16vw, 220px)",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontSize: "clamp(2.75rem, 7vw, 4.75rem)",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        lineHeight: 1.05,
        color: "var(--foreground)",
      }}
    >
      Study Smarter with{" "}
      <span style={{ fontFamily: "var(--font-wordmark)", fontWeight: 400 }}>
        Lumora
      </span>
      .
    </span>
  );
}

// Keeps `ogl` and the shader's WebGL setup out of the initial Home bundle
// and off the critical path to the hero heading — same pattern as
// HeroShaderBackground's dynamic ShaderScene import. This one matters for
// LCP specifically: the heading is real, load-bearing content, and
// HeroHeadlineFallback is real static text with matching typography, so
// the browser paints it immediately with no dependency on hydration, WebGL
// init, or `document.fonts.ready`. The animated version layers in once the
// dynamic import resolves.
const WarpText = dynamic(() => import("./components/home/WarpText"), {
  ssr: false,
  loading: () => <HeroHeadlineFallback />,
});

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// `baseWidth` renders straight into an inline style, so a naive
// useState(lazyInitializer) would compute 520 on the server and something
// narrower on the client — but hydration doesn't force-patch a mismatched
// inline style, so it would silently stick past hydration. useSyncExternalStore
// fixes this: the server snapshot (520) hydrates first, then React
// reconciles to the real value as an ordinary update — no mismatch.
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

// The hero headline, split so "Lumora" renders in the brand's wordmark
// font (`font-wordmark`, resolves to Pacifico) instead of WarpText's base
// display font — same treatment used everywhere else the brand name
// appears as itself. The trailing period stays in the base font since
// Pacifico's descender/period shape reads badly right after the word.
// Pacifico only ships weight 400, explicitly overridden here rather than
// inheriting WarpText's bold default. A module-level constant, not built
// inline in JSX, so WarpText's props-sync effect doesn't refire on every
// Home render for a value that never changes.
const HERO_HEADLINE_RUNS: WarpTextRun[] = [
  { text: "Study Smarter with " },
  { text: "Lumora", fontFamily: "var(--font-wordmark)", fontWeight: 400 },
  { text: "." },
];

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
  // TEST VARIANT (see SpecularButton usage below): the hero CTA's fill,
  // outline, and shine color are overridden per-theme here rather than
  // using SpecularButton's own default (opaque --primary fill) — ogl's
  // Color needs a literal value, not a CSS var, so this is the one piece
  // that can't just be "var(--foreground)" the way textColor is.
  const isDark = useIsDarkTheme();
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

            <h1 ref={heroHeadingRef} className="w-full max-w-3xl">
              <WarpText
                text={HERO_HEADLINE_RUNS}
                fontSize="clamp(2.75rem, 7vw, 4.75rem)"
                fontWeight={700}
                letterSpacing="-0.02em"
                lineHeight={1.05}
                warpStrength={0.05}
                warpScale={1.6}
                speed={0.35}
                pointerInfluence={0.35}
                pointerStrength={0.28}
                refraction={0.01}
                ripple
                style={{ minHeight: "clamp(140px, 16vw, 220px)" }}
              />
            </h1>

            <p
              ref={heroDescriptionRef}
              className="max-w-xl text-lg text-balance text-muted-foreground"
            >
              Lumora is an AI study companion that explains concepts clearly,
              quizzes you on what you&apos;ve learned, and helps it stick.
            </p>

            <div ref={heroCtaRef}>
              {/*
                TEST VARIANT, may be reverted later: fill matches the
                surrounding page (fully transparent, tintOpacity 0) instead
                of SpecularButton's default opaque --primary pill — the
                button reads purely by its outline + moving shine, white/
                light in dark mode, black/dark in light mode.
              */}
              <SpecularButton
                href="/generate"
                size="lg"
                tintOpacity={0}
                textColor="var(--foreground)"
                lineColor={isDark ? "#ffffff" : "#0a0a0a"}
                baseColor={isDark ? "#e4e4e7" : "#27272a"}
                className="motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.03] active:scale-[0.98]"
              >
                Start Learning
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </SpecularButton>
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
