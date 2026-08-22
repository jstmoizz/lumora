import Link from "next/link";
import { CircleAlertIcon } from "lucide-react";
import { getServerUser } from "@/lib/supabase/server";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  // Reached only via a Supabase recovery link, which establishes a session
  // server-side (in app/auth/confirm/route.ts) before redirecting here —
  // so a missing session at this point means the link was invalid, expired,
  // or already used, not that anything else went wrong.
  const user = await getServerUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400">
          <CircleAlertIcon aria-hidden="true" className="size-6" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Link invalid or expired
          </h1>
          <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
            This password reset link is invalid or has expired.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Set a new password
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Choose a new password for your account.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-card p-6 dark:border-zinc-800">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
