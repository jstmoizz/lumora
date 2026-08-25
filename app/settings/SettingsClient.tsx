"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import {
  BotIcon,
  BadgeCheckIcon,
  CheckIcon,
  ChevronDownIcon,
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
import {
  updateUserSetting,
  type UpdatableSettingField,
} from "@/lib/supabase/settings-actions";
import type { UserSettings } from "@/lib/supabase/settings";
import {
  applyThemePreference,
  hasStoredThemePreference,
  isThemePreference,
  type ThemePreference,
} from "../components/theme/theme";
import {
  applyGenerateAccent,
  DEFAULT_GENERATE_ACCENT,
  GENERATE_ACCENTS,
  getStoredGenerateAccent,
  isGenerateAccent,
  type GenerateAccent,
} from "../components/theme/generateAccent";
import "../components/theme/generate-accent.css";

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
// preview content the section wants. No border/background/radius of its
// own — sections live inside one shared panel (see SettingsClient's return
// below) and are separated by that panel's `divide-y`, not by stacking
// five identical cards on top of each other.
function SettingsSection({
  sectionRef,
  icon: Icon,
  title,
  description,
  children,
}: {
  sectionRef: RefObject<HTMLElement | null>;
  icon: typeof PaletteIcon;
  title: ReactNode;
  description: string;
  children: ReactNode;
}) {
  return (
    <section ref={sectionRef} className="flex flex-col gap-4 px-5 py-6 sm:px-6">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

// A real, persisted study preference: label on top, a small group of
// mutually-exclusive options below — same "outline/secondary + CheckIcon"
// button-group pattern the Appearance row below uses, just for free-text
// preferences instead of the fixed theme enum. Clicking an option calls the
// `updateUserSetting` Server Action directly; there's no separate "Save"
// button, an isPending/error/justSaved cycle is the only feedback.
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
  // `isPending`/`current` are React state — two clicks in the same
  // synchronous pass both still see the pre-click values, so the check
  // alone can't stop both from starting a save. This ref closes that
  // window — same pattern as `isSubmittingRef` in ChatInterface.tsx.
  const isSavingRef = useRef(false);

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
    if (isSavingRef.current) return;
    if (option === current || isPending) return;
    setError(null);
    setJustSaved(false);
    isSavingRef.current = true;
    startTransition(async () => {
      try {
        const result = await updateUserSetting(field, option);
        if (result.error) {
          setError(result.error);
          return;
        }
        setCurrent(option);
        setJustSaved(true);
      } finally {
        isSavingRef.current = false;
      }
    });
  }

  const statusId = `${field}-status`;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-transparent px-3 py-2.5 transition-colors duration-150 ease-out hover:border-border hover:bg-muted/40">
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
              className={isSelected ? "border-primary/30" : undefined}
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
          <span className="text-muted-foreground">Saving…</span>
        )}
        {!isPending && error && (
          <span
            role="alert"
            className="flex items-center gap-1 text-destructive"
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

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof MonitorIcon }[] = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
];

// Applies instantly and locally (`applyThemePreference`, no round trip
// needed) and separately persists to `user_settings.theme` for cross-
// device durability — the two are independent, so a slow or failed save
// never blocks the theme from actually changing on screen. See theme.ts.
function AppearanceRow({ initialTheme }: { initialTheme: ThemePreference }) {
  const [current, setCurrent] = useState<ThemePreference>(initialTheme);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  // See StudyPreferenceRow's `isSavingRef` above for why `isPending`/
  // `current` alone can't close the same-tick double-click window — same
  // pattern, applied to this row's own separate theme mutation.
  const isSavingRef = useRef(false);

  // Reconciles the durable (database) value into local storage/DOM, but
  // ONLY on a browser that's never made a local theme choice — the
  // cross-device bootstrap case. A real local choice, once made, is
  // authoritative for this browser from then on; nothing here should ever
  // second-guess it again (comparing against a merely-disagreeing database
  // value caused theme to silently revert to "system" on navigation).
  useEffect(() => {
    if (!hasStoredThemePreference()) {
      applyThemePreference(initialTheme);
    }
    // Only ever meant to run once, against the value Settings loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!justSaved) return;
    const timeout = setTimeout(() => setJustSaved(false), SAVED_CONFIRMATION_MS);
    return () => clearTimeout(timeout);
  }, [justSaved]);

  function handleSelect(option: ThemePreference) {
    if (isSavingRef.current) return;
    if (option === current || isPending) return;
    setError(null);
    setJustSaved(false);
    applyThemePreference(option);
    setCurrent(option);
    isSavingRef.current = true;
    startTransition(async () => {
      try {
        const result = await updateUserSetting("theme", option);
        if (result.error) {
          setError(result.error);
          return;
        }
        setJustSaved(true);
      } finally {
        isSavingRef.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Appearance"
        aria-describedby={error || justSaved ? "theme-status" : undefined}
        className="flex flex-wrap gap-2"
      >
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const isSelected = value === current;
          return (
            <Button
              key={value}
              type="button"
              variant={isSelected ? "secondary" : "outline"}
              size="sm"
              disabled={isPending}
              aria-current={isSelected ? "true" : undefined}
              onClick={() => handleSelect(value)}
              className={isSelected ? "border-primary/30" : undefined}
            >
              <Icon aria-hidden="true" className="size-3.5" />
              {label}
              {isSelected && (
                <CheckIcon aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          );
        })}
      </div>
      <div id="theme-status" className="min-h-4 text-xs">
        {isPending && <span className="text-muted-foreground">Saving…</span>}
        {!isPending && error && (
          <span role="alert" className="flex items-center gap-1 text-destructive">
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

// A dropdown, not a button row like AppearanceRow — 10 options don't fit
// as buttons without wrapping. localStorage-only (see generateAccent.ts):
// no server round trip, so unlike AppearanceRow this never shows a
// pending/error/"Saved" state — the selection just applies instantly.
//
// No `initial*` prop: nothing durable backs this value, so it starts at
// the default and corrects itself from localStorage in an effect.
function GenerateAccentRow() {
  const [accent, setAccent] = useState<GenerateAccent>(DEFAULT_GENERATE_ACCENT);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a value only knowable client-side (localStorage), not a state-mirrors-state loop.
    setAccent(getStoredGenerateAccent());
  }, []);

  function handleSelect(next: string) {
    if (!isGenerateAccent(next) || next === accent) return;
    setAccent(next);
    applyGenerateAccent(next);
  }

  const current =
    GENERATE_ACCENTS.find((option) => option.value === accent) ??
    GENERATE_ACCENTS[0];

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-muted-foreground">
          Generate accent
        </span>
        <span className="text-xs text-muted-foreground/70">
          Accent color for the Generate workspace.
        </span>
      </div>

      <DropdownMenuPrimitive.Root>
        <DropdownMenuPrimitive.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Generate accent: ${current.label}. Change accent.`}
            className="gap-1.5"
          >
            <span
              aria-hidden="true"
              data-generate-accent={accent}
              className="size-2.5 shrink-0 rounded-full bg-[var(--generate-accent)]"
            />
            {current.label}
            <ChevronDownIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
        >
          <DropdownMenuPrimitive.RadioGroup value={accent} onValueChange={handleSelect}>
            {GENERATE_ACCENTS.map((option) => (
              <DropdownMenuPrimitive.RadioItem
                key={option.value}
                value={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-accent"
              >
                <span
                  aria-hidden="true"
                  data-generate-accent={option.value}
                  className="size-2.5 shrink-0 rounded-full bg-[var(--generate-accent)]"
                />
                <span className="flex-1">{option.label}</span>
                <DropdownMenuPrimitive.ItemIndicator>
                  <CheckIcon aria-hidden="true" className="size-3.5" />
                </DropdownMenuPrimitive.ItemIndicator>
              </DropdownMenuPrimitive.RadioItem>
            ))}
          </DropdownMenuPrimitive.RadioGroup>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Root>
    </div>
  );
}

// A read-only "label: value" info row for the AI & Model section.
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
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
  // section rows' CSS hover transitions afterward.
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

  const initialTheme: ThemePreference =
    preferences && isThemePreference(preferences.theme)
      ? preferences.theme
      : "system";

  return (
    <main ref={pageRef} className="flex flex-1 justify-center px-6 py-16 pb-24 sm:py-20">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-col gap-1">
          <h1
            ref={titleRef}
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            Settings
          </h1>
          <p ref={subtitleRef} className="text-sm text-muted-foreground">
            Customize your Lumora experience.
          </p>
        </div>

        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {account && (
            <SettingsSection
              sectionRef={accountRef}
              icon={UserIcon}
              title="Account"
              description="The account you're signed in with."
            >
              <div className="flex flex-col divide-y divide-border">
                <InfoRow label="Email" value={account.email} />
                <div className="flex items-center justify-between gap-4 py-2">
                  <span className="text-sm text-muted-foreground">
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
            <div className="flex flex-col divide-y divide-border">
              <AppearanceRow initialTheme={initialTheme} />
              <GenerateAccentRow />
            </div>
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
              <p className="text-sm text-muted-foreground">
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
            <div className="flex flex-col divide-y divide-border">
              <InfoRow label="Provider" value="Groq" />
              <InfoRow label="Model" value="Auto-routed (fast + vision)" />
            </div>
          </SettingsSection>

          <SettingsSection
            sectionRef={aboutRef}
            icon={InfoIcon}
            title={
              <>
                About <span className="font-wordmark text-lg">Lumora</span>
              </>
            }
            description="A little more about the product."
          >
            <p className="text-sm leading-relaxed text-muted-foreground">
              Lumora is an AI-powered study companion designed to make
              learning clearer, more focused, and more personal.
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-wordmark text-sm">Lumora</span> &middot;
              Study smarter.
            </p>
          </SettingsSection>
        </div>
      </div>
    </main>
  );
}
