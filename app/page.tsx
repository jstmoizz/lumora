"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
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
import { useReducedMotion } from "./components/useReducedMotion";
import BorderGlow from "./components/home/BorderGlow";
import Carousel, { type CarouselItem } from "./components/home/Carousel";
import HeroScrollShell from "./components/home/HeroScrollShell";
import HeroShaderBackground from "./components/home/HeroShaderBackground";
import WarpText, { type WarpTextRun } from "./components/home/WarpText";
import "./components/home/HeroHeadlineFallback.css";

// Mirrors HERO_HEADLINE_RUNS as real DOM text, not canvas-rasterized. No
// hooks: this renders before hydration, and sizing/color come from
// HeroHeadlineFallback.css (driven by ThemeScript's synchronous class) so
// the first paint is correct with no hydration-time flash.
function HeroHeadlineFallback() {
  return (
    <span
      className="hero-headline-fallback"
      style={{
        display: "flex",
        minHeight: "clamp(140px, 16vw, 220px)",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <span
        className="hero-headline-fallback-text"
        style={{
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
        }}
      >
        Study Smarter with{" "}
        <span style={{ fontFamily: "var(--font-wordmark)", fontWeight: 400 }}>
          Lumora
        </span>
        .
      </span>
    </span>
  );
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// `baseWidth` renders into an inline style — a plain useState lazy
// initializer would compute a server value that silently sticks past
// hydration. useSyncExternalStore hydrates the server snapshot first, then
// reconciles to the real value as an ordinary update.
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

// One step darker (600-weight) than the hero blobs — at the blobs' own
// lightness the glow read as a pale wash, especially in light mode.
const GLOW_COLORS = ["#4f46e5", "#db2777", "#7c3aed"];
const GLOW_HSL = "262 83 58"; // violet-600, for BorderGlow's outer edge-light halo

// "Lumora" renders in the brand's wordmark font instead of WarpText's base
// display font; the trailing period stays in the base font since
// Pacifico's period shape reads badly right after the word. A module-level
// constant so WarpText's props-sync effect doesn't refire on every render.
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
  // The hero CTA's fill/outline/shine colors are overridden per-theme
  // below, since ogl's Color needs a literal value, not a CSS var.
  const isDark = useIsDarkTheme();
  const reducedMotion = useReducedMotion();
  // WarpText is a static import and is usually ready fast; HeroShaderBackground's
  // ShaderScene is next/dynamic (kept out of the initial bundle — see that
  // file) and can mount well after WarpText on some devices/connections.
  // `warpReady` only becomes true once BOTH have reported in, so the
  // curtain below never lifts onto a still-loading background (which would
  // show the plain AuroraBackground fallback, then visibly pop into the
  // real shader a moment later).
  const [warpTextReady, setWarpTextReady] = useState(false);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const warpReady = warpTextReady && backgroundReady;
  // Safety net only: if WebGL never initializes (unsupported browser, driver
  // failure, etc.) onReady never fires, so fall back to the plain text
  // instead of leaving the curtain up forever. Comfortably longer than
  // either piece's real init time.
  const [warpTimedOut, setWarpTimedOut] = useState(false);
  useEffect(() => {
    if (warpReady) return undefined;
    const timer = window.setTimeout(() => setWarpTimedOut(true), 4000);
    return () => window.clearTimeout(timer);
  }, [warpReady]);
  // Set if WarpText's WebGL context is lost after already being ready (a
  // GPU driver crash/reset — rare, but real; see WarpText's own comment on
  // its onContextLost prop). WarpText hides its own now-dead canvas, but it
  // has no text of its own to fall back to, so this brings the plain
  // fallback back regardless of `warpReady` having already gone true once.
  const [warpBroken, setWarpBroken] = useState(false);
  // The plain-text fallback is only ever the visible layer for reduced-motion
  // users (shown immediately, no curtain), as the timeout safety net above,
  // or if WarpText's context was lost after the fact — otherwise the
  // curtain hides this whole area until WarpText is ready.
  const fallbackVisible = warpBroken || (!warpReady && (reducedMotion || warpTimedOut));
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

  // Loaded in the background so it's ready by the time a user scrolls to
  // the feature cards, without holding up the hero's own static gsap import.
  const [scrollTriggerReady, setScrollTriggerReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("gsap/ScrollTrigger").then(({ ScrollTrigger }) => {
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      setScrollTriggerReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // One-time cascading entrance for the hero.
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

  // Stagger in the first time the section crosses into view. If the user
  // scrolls here before scrollTriggerReady resolves, cards render without it.
  useGSAP(
    () => {
      if (prefersReducedMotion() || !featuresRef.current || !scrollTriggerReady) return;
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
    { scope: featuresRef, dependencies: [scrollTriggerReady] },
  );

  return (
    // overflow-x-clip, not -hidden (which would disable position: sticky),
    // contains BorderGlow's outer-glow bleed past the viewport edge.
    <main className="flex flex-1 flex-col overflow-x-clip pb-24">
        {/* Hero — opens fullscreen and settles into a contained card as
            the user scrolls past it; see HeroScrollShell for the
            technique. */}
        <HeroScrollShell>
          <section
            ref={heroRef}
            className="relative flex h-full flex-col items-center justify-center gap-6 overflow-hidden px-6 py-28 text-center sm:py-36"
          >
            <HeroShaderBackground
              onBackgroundReady={() => setBackgroundReady(true)}
            />

            <span
              ref={heroEyebrowRef}
              className="rounded-full border border-border px-4 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              AI Study Companion
            </span>

            <h1 ref={heroHeadingRef} className="w-full max-w-3xl">
              {/*
                WarpText is a plain static import (like SpecularButton
                below), not a next/dynamic({ssr:false}) chunk — `ogl`
                imports fine in Node (verified directly), and WarpText's own
                render has no browser-API dependency, only its effects do,
                which never run server-side regardless. A separate chunk
                meant an extra network round-trip (fetch, on top of the main
                bundle) purely to defer ~183KB off the initial payload; going
                static trades a bigger homepage bundle for cutting that
                round-trip out of the time-to-first-frame entirely.

                Two layers share this box: HeroHeadlineFallback (real DOM
                text, only visible for reduced motion or the WebGL-timeout
                fallback — see `fallbackVisible`) and WarpText itself, fading
                in once it reports a real frame drawn (onReady). On the
                normal path, neither is visible at first — a plain,
                background-colored curtain over the whole hero (see the
                `hero-loading-curtain` div below) hides this area, and the
                shader behind it, until WarpText is ready, then fades away
                to reveal the finished hero in one step. Exactly one of
                {fallback, WarpText} is ever exposed to the accessibility
                tree at a time (the other gets aria-hidden) so a screen
                reader never hears the headline announced twice.
              */}
              <span className="hero-headline-stack">
                <span
                  aria-hidden={!fallbackVisible}
                  className={`hero-headline-fallback-wrap${fallbackVisible ? " hero-headline-fallback-wrap--visible" : ""}`}
                >
                  <HeroHeadlineFallback />
                </span>
                <span aria-hidden={fallbackVisible}>
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
                    onReady={() => setWarpTextReady(true)}
                    onContextLost={() => setWarpBroken(true)}
                    className={`hero-headline-warp${warpReady && !warpBroken ? " hero-headline-warp--ready" : ""}`}
                  />
                </span>
              </span>
            </h1>

            <p
              ref={heroDescriptionRef}
              className="max-w-xl text-lg text-balance text-muted-foreground"
            >
              Lumora is an AI study companion that explains concepts clearly,
              quizzes you on what you&apos;ve learned, and helps it stick.
            </p>

            <div ref={heroCtaRef}>
              {/* Transparent fill (tintOpacity 0) instead of SpecularButton's default pill — reads by outline + moving shine alone. */}
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

            {/*
              Plain, background-colored curtain over the whole hero (text
              and shader both) — reads as black in dark mode, white in
              light mode, no color/animation of its own. Hides the hero
              entirely until WarpText is ready, then fades out in one step
              so the finished hero (shader + text together) appears at
              once, instead of a static-text pop or a partially-formed
              background. Skipped outright under reduced motion, which
              shows the finished hero immediately.

              position/background/opacity are inlined rather than left to
              the `hero-loading-curtain` CSS class — under `next dev`,
              Turbopack injects CSS asynchronously instead of a
              render-blocking <link>, so for a brief window after first
              paint this div would otherwise have no background and no
              positioning at all, letting the (also not-yet-hidden) plain
              fallback text underneath show through. Inline styles are part
              of the HTML itself, so they're correct from the very first
              paint regardless of when CSS finishes loading. Only the fade
              transition itself is left in the CSS class.
            */}
            {!reducedMotion && (
              <div
                aria-hidden="true"
                className="hero-loading-curtain"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 20,
                  background: "var(--background)",
                  opacity: warpReady || warpTimedOut ? 0 : 1,
                  pointerEvents: "none",
                }}
              />
            )}
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
