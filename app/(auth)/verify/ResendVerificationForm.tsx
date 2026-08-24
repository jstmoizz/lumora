"use client";

import { useActionState, useEffect, useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  resendVerificationEmail,
  type ResendVerificationState,
} from "@/lib/supabase/actions";

const initialState: ResendVerificationState = { error: null, success: false };

// Client-side cooldown after a successful send, on top of Supabase's own
// server-side rate limit — stops the button from being used to spam an inbox.
const COOLDOWN_SECONDS = 30;

export default function ResendVerificationForm({
  defaultEmail,
}: {
  defaultEmail?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    resendVerificationEmail,
    initialState,
  );
  const [cooldown, setCooldown] = useState(0);

  // Starts the cooldown the moment a new result arrives, using React's
  // "adjust state during render" pattern instead of a useEffect — avoids an
  // extra render cycle just to react to `state` changing.
  const [lastHandledState, setLastHandledState] = useState(initialState);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.success) {
      setCooldown(COOLDOWN_SECONDS);
    }
  }

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const disabled = isPending || cooldown > 0;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="resend-email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <Input
          id="resend-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "resend-error" : undefined}
        />
      </div>

      {state.error && (
        <div
          id="resend-error"
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400"
        >
          <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {state.success && cooldown > 0 && (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          Verification email sent — check your inbox.
        </p>
      )}

      <Button
        type="submit"
        variant="outline"
        disabled={disabled}
        className="h-10 w-full rounded-xl text-sm font-medium"
      >
        {isPending
          ? "Sending…"
          : cooldown > 0
            ? `Resend available in ${cooldown}s`
            : "Resend verification email"}
      </Button>
    </form>
  );
}
