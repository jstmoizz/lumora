"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  BotIcon,
  CheckIcon,
  InfoIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  SlidersHorizontalIcon,
  SunIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHAT_MODEL_ID } from "@/lib/ai/model";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A settings section: small icon badge + title/description, then whatever
// preview content the section wants. Kept local to this file rather than
// extracted to app/components/settings/ since it's a thin, single-use
// wrapper around four sections that all live on this one page.
function SettingsSection({
  sectionRef,
  icon: Icon,
  title,
  description,
  children,
}: {
  sectionRef: RefObject<HTMLElement | null>;
  icon: typeof PaletteIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      ref={sectionRef}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-card p-5 dark:border-zinc-800 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

// A future study-preference row: label + current placeholder value on the
// left, a "coming soon" indicator on the right. Purely presentational, no
// click handler — it must not imply a setting can be changed or saved.
function PreferenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-transparent px-3 py-2.5 transition-colors duration-150 ease-out hover:border-zinc-200 hover:bg-muted/40 dark:hover:border-zinc-800">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          {value}
        </span>
      </div>
      <span className="shrink-0 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
        Coming soon
      </span>
    </div>
  );
}

// A read-only "label: value" info row for the AI & Model section. The
// Model row's value is `CHAT_MODEL_ID` itself (see lib/ai/model.ts) rather
// than a hand-written display name, so it cannot drift out of sync with
// the model actually configured for the chat route.
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const appearanceRef = useRef<HTMLElement>(null);
  const preferencesRef = useRef<HTMLElement>(null);
  const aiRef = useRef<HTMLElement>(null);
  const aboutRef = useRef<HTMLElement>(null);

  // One-time entrance: page title -> subtitle -> the four section cards
  // (staggered together). Short fade + small upward move, matching the
  // recipe already established on Home/History. `clearProps: "all"` on
  // every tween so GSAP's inline transforms don't linger and block the
  // section rows' CSS hover transitions afterward — the exact bug hit and
  // fixed during the Home redesign.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (
        !titleRef.current ||
        !subtitleRef.current ||
        !appearanceRef.current ||
        !preferencesRef.current ||
        !aiRef.current ||
        !aboutRef.current
      ) {
        return;
      }

      gsap
        .timeline({
          defaults: { ease: "power2.out", duration: 0.3, clearProps: "all" },
        })
        .from(titleRef.current, { opacity: 0, y: 12 })
        .from(subtitleRef.current, { opacity: 0, y: 8 }, "-=0.2")
        .from(
          [
            appearanceRef.current,
            preferencesRef.current,
            aiRef.current,
            aboutRef.current,
          ],
          { opacity: 0, y: 14, stagger: 0.05 },
          "-=0.2",
        );
    },
    { scope: pageRef, dependencies: [] },
  );

  return (
    <main ref={pageRef} className="flex flex-1 justify-center px-6 py-16 sm:py-20">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-col gap-1">
          <h1
            ref={titleRef}
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            Settings
          </h1>
          <p
            ref={subtitleRef}
            className="text-sm text-zinc-500 dark:text-zinc-400"
          >
            Customize your Lumora experience.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <SettingsSection
            sectionRef={appearanceRef}
            icon={PaletteIcon}
            title="Appearance"
            description="Choose how Lumora looks across your device."
          >
            <div
              role="group"
              aria-label="Appearance (preview only)"
              className="flex flex-wrap gap-2"
            >
              <Button type="button" variant="outline" size="sm" disabled>
                <MonitorIcon aria-hidden="true" className="size-3.5" />
                System
              </Button>
              <Button type="button" variant="outline" size="sm" disabled>
                <SunIcon aria-hidden="true" className="size-3.5" />
                Light
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled
                aria-current="true"
                className="border-foreground/15"
              >
                <MoonIcon aria-hidden="true" className="size-3.5" />
                Dark
                <CheckIcon aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Appearance controls are coming soon. Lumora currently uses its
              dark, primary appearance.
            </p>
          </SettingsSection>

          <SettingsSection
            sectionRef={preferencesRef}
            icon={SlidersHorizontalIcon}
            title="Study Preferences"
            description="Shape how Lumora helps you learn."
          >
            <PreferenceRow label="Response style" value="Clear and concise" />
            <PreferenceRow label="Explanation depth" value="Detailed" />
            <PreferenceRow label="Learning focus" value="General" />
          </SettingsSection>

          <SettingsSection
            sectionRef={aiRef}
            icon={BotIcon}
            title="AI & Model"
            description="Information about the model powering your study sessions."
          >
            <div className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              <InfoRow label="Provider" value="Groq" />
              <InfoRow label="Model" value={CHAT_MODEL_ID} />
            </div>
          </SettingsSection>

          <SettingsSection
            sectionRef={aboutRef}
            icon={InfoIcon}
            title="About Lumora"
            description="A little more about the product."
          >
            <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Lumora is an AI-powered study companion designed to make
              learning clearer, more focused, and more personal.
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Lumora &middot; Study smarter.
            </p>
          </SettingsSection>
        </div>
      </div>
    </main>
  );
}
