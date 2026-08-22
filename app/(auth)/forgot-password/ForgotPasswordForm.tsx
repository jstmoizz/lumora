"use client";

import { useActionState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  requestPasswordReset,
  type RequestPasswordResetState,
} from "@/lib/supabase/actions";

const initialState: RequestPasswordResetState = { error: null, success: false };

export default function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  if (state.success) {
    return (
      <p role="status" className="text-sm text-foreground">
        If an account exists for that email, we&apos;ve sent a password reset
        link. Check your inbox.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "forgot-password-error" : undefined}
        />
      </div>

      {state.error && (
        <div
          id="forgot-password-error"
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400"
        >
          <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-xl text-sm font-semibold"
      >
        {isPending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
