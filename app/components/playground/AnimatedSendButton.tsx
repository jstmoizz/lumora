"use client";

import {
  useEffect,
  useReducer,
  useRef,
  type ButtonHTMLAttributes,
} from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CheckIcon, Loader2Icon, RotateCcwIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SendButtonState = "idle" | "loading" | "success" | "error";

// Spec calls for a 700-900ms success hold before returning to idle.
const SUCCESS_HOLD_MS = 800;

// A soft, no-overshoot landing (decelerates hard, never bounces past the
// resting value) for the icon/label crossfade on every state change -
// matches the restrained feel of the GSAP easing already used elsewhere in
// the app (power2.out-family) without reusing a named GSAP ease verbatim.
const SETTLE_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Action =
  | { type: "SUBMIT" }
  | { type: "RESOLVE_SUCCESS" }
  | { type: "RESOLVE_ERROR" }
  | { type: "RESET" };

// The state machine is the single source of truth; GSAP only ever reacts to
// `state` (see the useGSAP below), it never decides what the state is.
function reducer(state: SendButtonState, action: Action): SendButtonState {
  switch (action.type) {
    case "SUBMIT":
      return state === "idle" || state === "error" ? "loading" : state;
    case "RESOLVE_SUCCESS":
      return state === "loading" ? "success" : state;
    case "RESOLVE_ERROR":
      return state === "loading" ? "error" : state;
    case "RESET":
      return state === "success" ? "idle" : state;
    default:
      return state;
  }
}

const STATE_COPY: Record<SendButtonState, string> = {
  idle: "Send message",
  loading: "Sending…",
  success: "Sent",
  error: "Retry",
};

export interface AnimatedSendButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick" | "children"
  > {
  // Caller-supplied unit of work. Resolve -> success, reject -> error. The
  // same callback drives both the initial send and every retry.
  onSubmit: () => Promise<void>;
  // Read-only observer for hosts that want to mirror the button's state
  // (e.g. a demo's "current state" indicator) - it never feeds back in and
  // never makes the component "controlled".
  onStateChange?: (state: SendButtonState) => void;
}

export default function AnimatedSendButton({
  onSubmit,
  onStateChange,
  disabled = false,
  className,
  ...props
}: AnimatedSendButtonProps) {
  const [state, dispatch] = useReducer(reducer, "idle");

  // Synchronous guard against a second click firing before React has
  // re-rendered with the "loading" state - the same pattern already used
  // for Generate's retry button (`isRetryingRef` in ChatInterface.tsx),
  // since state alone can be stale for a rapid double-click within one tick.
  const isBusyRef = useRef(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contentRef = useRef<HTMLSpanElement>(null);
  const iconSlotRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Success auto-returns to idle after a brief hold. The timeout is cleared
  // whenever `state` changes again or the component unmounts, so a stale
  // timer can never fire against a state it no longer applies to.
  useEffect(() => {
    if (state !== "success") return;
    resetTimeoutRef.current = setTimeout(() => {
      dispatch({ type: "RESET" });
    }, SUCCESS_HOLD_MS);
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, [state]);

  // Icon + label choreography, plus the single error shake. Keyed only on
  // `state`, so this is what makes the motion interruptible: useGSAP
  // reverts whatever tween was still in flight before starting the next
  // one, meaning a rapid state change never has to wait on the previous
  // transition to finish first.
  useGSAP(
    () => {
      const iconSlot = iconSlotRef.current;
      const label = labelRef.current;
      const content = contentRef.current;
      if (!iconSlot || !label || !content) return;

      // Reduced motion: state, label, icon and color already updated via
      // plain React render above - this only has to make sure no leftover
      // transform/opacity is stuck mid-transition.
      if (prefersReducedMotion()) {
        gsap.set([iconSlot, label], {
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          clearProps: "all",
        });
        gsap.set(content, { x: 0, clearProps: "all" });
        return;
      }

      const tl = gsap.timeline({
        defaults: { duration: 0.22, ease: SETTLE_EASE },
      });

      tl.fromTo(
        iconSlot,
        { opacity: 0, y: -4, scale: 0.85 },
        { opacity: 1, y: 0, scale: 1, clearProps: "all" },
      ).fromTo(
        label,
        { opacity: 0, y: -3 },
        { opacity: 1, y: 0, clearProps: "all" },
        "<",
      );

      if (state === "error") {
        // A single decaying shake, expressed as four explicit steps rather
        // than GSAP's "simple keyframes" shorthand - clearProps reliably
        // fires on a plain `.to()` (proven above by the crossfade tweens),
        // which keyframes did not honor, leaving a resting inline
        // `transform: translate(0px, 0px)` behind.
        tl.to(content, { x: -6, duration: 0.08, ease: "power1.inOut" }, "+=0.05")
          .to(content, { x: 5, duration: 0.08, ease: "power1.inOut" })
          .to(content, { x: -3, duration: 0.08, ease: "power1.inOut" })
          .to(content, {
            x: 0,
            duration: 0.08,
            ease: "power1.inOut",
            clearProps: "transform",
          });
      }
    },
    { dependencies: [state], scope: contentRef },
  );

  async function handleClick() {
    if (isBusyRef.current) return;
    if (state !== "idle" && state !== "error") return;
    isBusyRef.current = true;
    dispatch({ type: "SUBMIT" });
    try {
      await onSubmit();
      dispatch({ type: "RESOLVE_SUCCESS" });
    } catch {
      dispatch({ type: "RESOLVE_ERROR" });
    } finally {
      isBusyRef.current = false;
    }
  }

  const Icon =
    state === "loading"
      ? Loader2Icon
      : state === "success"
        ? CheckIcon
        : state === "error"
          ? RotateCcwIcon
          : SendIcon;

  return (
    <Button
      type="button"
      variant="default"
      data-state={state}
      aria-busy={state === "loading"}
      aria-disabled={state === "loading" ? true : undefined}
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "h-11 min-w-[10.5rem] gap-1.5 rounded-xl px-5 text-sm font-semibold",
        "motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out",
        "motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.03]",
        "data-[state=success]:bg-green-500/10 data-[state=success]:text-green-700 data-[state=success]:hover:bg-green-500/10 dark:data-[state=success]:bg-green-500/20 dark:data-[state=success]:text-green-400",
        "data-[state=error]:bg-destructive/10 data-[state=error]:text-destructive data-[state=error]:hover:bg-destructive/20 dark:data-[state=error]:bg-destructive/20 dark:data-[state=error]:hover:bg-destructive/30",
        className,
      )}
      {...props}
    >
      <span ref={contentRef} className="inline-flex items-center gap-1.5">
        <span
          ref={iconSlotRef}
          className="relative inline-flex size-4 shrink-0 items-center justify-center"
        >
          <Icon
            aria-hidden="true"
            className={cn(
              "size-4",
              state === "loading" && "motion-safe:animate-spin",
            )}
          />
        </span>
        <span ref={labelRef}>{STATE_COPY[state]}</span>
      </span>
    </Button>
  );
}
