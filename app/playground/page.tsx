"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import AnimatedSendButton, {
  type SendButtonState,
} from "@/app/components/playground/AnimatedSendButton";

const exercises = [
  {
    href: "/playground/disclosure",
    label: "Disclosure",
    description: "Expand/collapse pattern exercise.",
  },
  {
    href: "/playground/tabs",
    label: "Tabs",
    description: "Tabbed interface pattern exercise.",
  },
  {
    href: "/playground/modal",
    label: "Modal",
    description: "Dialog/modal pattern exercise.",
  },
];

// FE09 demo copy - documents the actual values used by AnimatedSendButton
// so an evaluator can check the motion against the rationale directly,
// rather than trusting a separate design doc.
const MOTION_DECISIONS = [
  "Idle → hover/focus: 150ms, Tailwind's default ease-out, a subtle -1px lift + 3% scale — identical to the hover treatment already used by Generate's Send button and other Lumora CTAs, so this button doesn't introduce a new resting feel.",
  "State transitions (idle/loading/success/error): a 220ms GSAP timeline crossfades the icon and label (opacity + a small vertical settle) using a custom cubic-bezier(0.16, 1, 0.3, 1) ease — decelerates hard with no overshoot, reading as “settling into place” rather than bouncing.",
  "Loading: the spinner uses Tailwind's animate-spin, the same convention already used for the Retry spinner on Generate's error card — continuous and CSS-driven, not GSAP-driven.",
  "Success: holds for ~800ms (within the 700–900ms brief) before returning to idle. The hold is a plain timeout inside the state machine, not a GSAP onComplete callback — the animation reacts to state, not the other way around.",
  "Error: once the label/icon settle on “Retry,” a single 320ms horizontal shake plays exactly once (0 → -6 → 5 → -3 → 0px). It's part of the same state-keyed timeline, so it can't loop or replay without a fresh error.",
  "Background/text color changes ride on the shared Button component's own default 150ms CSS transition, so the palette shift settles on the same cadence as the hover motion.",
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PlaygroundPage() {
  const [outcome, setOutcome] = useState<"success" | "error">("success");
  const [demoDisabled, setDemoDisabled] = useState(false);
  const [currentState, setCurrentState] = useState<SendButtonState>("idle");

  // Fake async unit of work - never touches the real /api/chat route. The
  // selected trigger is read at call time, so Retry (which calls this same
  // callback again) always reflects whichever trigger is currently active.
  const handleSubmit = useCallback(async () => {
    await wait(1100);
    if (outcome === "error") {
      throw new Error("Simulated failure");
    }
  }, [outcome]);

  return (
    <main className="flex flex-1 flex-col items-center gap-16 px-6 py-24 text-center">
      <div className="flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Playground
          </h1>
          <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-500">
            Isolated dev area for accessibility exercises. Not part of the
            production app.
          </p>
        </div>
        <ul className="flex w-full max-w-md flex-col gap-3">
          {exercises.map(({ href, label, description }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex flex-col gap-1 rounded-lg border border-zinc-300 px-4 py-3 text-left transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
              >
                <span className="text-sm font-semibold text-foreground">
                  {label}
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-500">
                  {description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <section className="flex w-full max-w-2xl flex-col gap-6 rounded-2xl border border-zinc-200 bg-card p-6 text-left dark:border-zinc-800 sm:p-8">
        <div className="flex flex-col gap-1 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Buttons with a Brain
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            FE09 — a reusable, state-driven Send button that narrates its
            own lifecycle through motion. Not wired to the real AI API.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-200 bg-background p-6 dark:border-zinc-800">
          <AnimatedSendButton
            onSubmit={handleSubmit}
            onStateChange={setCurrentState}
            disabled={demoDisabled}
          />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Current state:{" "}
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              {currentState}
            </code>
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                Simulated outcome
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={outcome === "success"}
                  onClick={() => setOutcome("success")}
                  className={
                    outcome === "success"
                      ? "rounded-lg border border-zinc-300 bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground dark:border-zinc-700"
                      : "rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:border-zinc-300 hover:text-foreground dark:text-zinc-400 dark:hover:border-zinc-700"
                  }
                >
                  Success trigger
                </button>
                <button
                  type="button"
                  aria-pressed={outcome === "error"}
                  onClick={() => setOutcome("error")}
                  className={
                    outcome === "error"
                      ? "rounded-lg border border-zinc-300 bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground dark:border-zinc-700"
                      : "rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:border-zinc-300 hover:text-foreground dark:text-zinc-400 dark:hover:border-zinc-700"
                  }
                >
                  Error trigger
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={demoDisabled}
                onChange={(event) => setDemoDisabled(event.target.checked)}
                className="size-4 rounded border-zinc-300 dark:border-zinc-700"
              />
              Disabled (bonus state)
            </label>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Send starts a ~1.1s fake request and resolves using whichever
            trigger is selected above. Retry (shown after an error) reuses
            the same fake request and reads the trigger again, so switching
            it before retrying changes the outcome.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-foreground">
            Motion decisions
          </h3>
          <ul className="flex flex-col gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {MOTION_DECISIONS.map((decision) => (
              <li key={decision} className="flex gap-2">
                <span aria-hidden="true">&middot;</span>
                <span>{decision}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Reduced motion: with prefers-reduced-motion enabled, the hover lift
          and all GSAP movement (crossfade slide, error shake) are skipped.
          State, label text, icon, and color still change immediately —
          motion here is a layer on top of the state machine, never a
          requirement for understanding it.
        </p>
      </section>
    </main>
  );
}
