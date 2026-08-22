"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  BotIcon,
  BadgeCheckIcon,
  CheckIcon,
  CircleAlertIcon,
  InfoIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  SlidersHorizontalIcon,
  SunIcon,
  UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHAT_MODEL_ID } from "@/lib/ai/model";
import {
  updateUserSetting,
  type UpdatableSettingField,
} from "@/lib/supabase/settings-actions";
import type { UserSettings } from "@/lib/supabase/settings";

export interface SettingsAccount {
  email: string;
  verified: boolean;
}

// How long the "Saved" confirmation stays visible after a successful
// update before quietly disappearing again.
const SAVED_CONFIRMATION_MS = 2500;

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A settings section: small icon badge + title/description, then whatever
// preview content the section wants. Kept local to this file rather than
// extracted to app/components/settings/ since it's a thin, single-use
// wrapper around the section cards that all live on this one page.
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

// A real, persisted study preference: label on top, a small group of
// mutually-exclusive options below — same "outline/secondary + CheckIcon"
// button-group pattern the Appearance section already established for
// "choose one of several options", just wired up for real here instead of
// disabled. Clicking an option calls the `updateUserSetting` Server Action
// directly; there's no separate "Save" button; a still-empty
// isPending/error/justSaved cycle is the only feedback, which is why it's
// its own component rather than an inline "coming soon" row.
function StudyPreferenceRow({
  label,
  field,
  options,
  value,
}: {
  label: string;
  field: UpdatableSettingField;
  options: readonly string[];
  value: string;
}) {
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Clears the transient "Saved" confirmation a couple seconds after it
  // appears — never fires for a save that never actually succeeded, since
  // `justSaved` is only ever set to true once updateUserSetting resolves
  // without an error.
  useEffect(() => {
    if (!justSaved) return;
    const timeout = setTimeout(() => setJustSaved(false), SAVED_CONFIRMATION_MS);
    return () => clearTimeout(timeout);
  }, [justSaved]);

  function handleSelect(option: string) {
    if (option === current || isPending) return;
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await updateUserSetting(field, option);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCurrent(option);
      setJustSaved(true);
    });
  }

  const statusId = `${field}-status`;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-transparent px-3 py-2.5 transition-colors duration-150 ease-out hover:border-zinc-200 hover:bg-muted/40 dark:hover:border-zinc-800">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div
        role="group"
        aria-label={label}
        aria-describedby={error || justSaved ? statusId : undefined}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => {
          const isSelected = option === current;
          return (
            <Button
              key={option}
              type="button"
              variant={isSelected ? "secondary" : "outline"}
              size="sm"
              disabled={isPending}
              aria-current={isSelected ? "true" : undefined}
              onClick={() => handleSelect(option)}
              className={isSelected ? "border-foreground/15" : undefined}
            >
              {option}
              {isSelected && (
                <CheckIcon aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          );
        })}
      </div>
      <div id={statusId} className="min-h-4 text-xs">
        {isPending && (
          <span className="text-zinc-500 dark:text-zinc-500">Saving…</span>
        )}
        {!isPending && error && (
          <span
            role="alert"
            className="flex items-center gap-1 text-red-600 dark:text-red-400"
          >
            <CircleAlertIcon aria-hidden="true" className="size-3.5" />
            {error}
          </span>
        )}
        {!isPending && !error && justSaved && (
          <span
            role="status"
            className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
          >
            <CheckIcon aria-hidden="true" className="size-3.5" />
            Saved
          </span>
        )}
      </div>
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

const RESPONSE_STYLE_OPTIONS = [
  "Clear and concise",
  "Detailed",
  "Conversational",
] as const;
const EXPLANATION_DEPTH_OPTIONS = ["Brief", "Detailed", "In-depth"] as const;
const LEARNING_FOCUS_OPTIONS = [
  "General",
  "Exam prep",
  "Deep understanding",
] as const;

export default function SettingsClient({
  account,
  preferences,
}: {
  account: SettingsAccount | null;
  preferences: UserSettings | null;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const accountRef = useRef<HTMLElement>(null);
  const appearanceRef = useRef<HTMLElement>(null);
  const preferencesRef = useRef<HTMLElement>(null);
  const aiRef = useRef<HTMLElement>(null);
  const aboutRef = useRef<HTMLElement>(null);

  // One-time entrance: page title -> subtitle -> the section cards
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
        !accountRef.current ||
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
            accountRef.current,
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
          {account && (
            <SettingsSection
              sectionRef={accountRef}
              icon={UserIcon}
              title="Account"
              description="The account you're signed in with."
            >
              <div className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                <InfoRow label="Email" value={account.email} />
                <div className="flex items-center justify-between gap-4 py-2">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Status
                  </span>
                  <span
                    className={
                      account.verified
                        ? "flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400"
                        : "text-sm font-medium text-foreground"
                    }
                  >
                    {account.verified && (
                      <BadgeCheckIcon aria-hidden="true" className="size-4" />
                    )}
                    {account.verified ? "Verified" : "Not verified"}
                  </span>
                </div>
              </div>
            </SettingsSection>
          )}

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
            {preferences ? (
              <>
                <StudyPreferenceRow
                  label="Response style"
                  field="response_style"
                  options={RESPONSE_STYLE_OPTIONS}
                  value={preferences.responseStyle}
                />
                <StudyPreferenceRow
                  label="Explanation depth"
                  field="explanation_depth"
                  options={EXPLANATION_DEPTH_OPTIONS}
                  value={preferences.explanationDepth}
                />
                <StudyPreferenceRow
                  label="Learning focus"
                  field="learning_focus"
                  options={LEARNING_FOCUS_OPTIONS}
                  value={preferences.learningFocus}
                />
              </>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Couldn&apos;t load your study preferences. Try refreshing the
                page.
              </p>
            )}
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
