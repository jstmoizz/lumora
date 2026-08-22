import Link from "next/link";
import { CheckCircleIcon, CircleAlertIcon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import ResendVerificationForm from "./ResendVerificationForm";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; email?: string }>;
}) {
  const { status, email } = await searchParams;

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          <CheckCircleIcon aria-hidden="true" className="size-6" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Email verified
          </h1>
          <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
            Your account is confirmed and you&apos;re signed in.
          </p>
        </div>
        <Button
          asChild
          className="h-11 gap-2 rounded-xl px-6 text-sm font-semibold"
        >
          <Link href="/generate">Continue to Lumora</Link>
        </Button>
      </div>
    );
  }

  if (status === "error") {
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
            This verification link is invalid, expired, or has already been
            used. If you&apos;re already verified, you can sign in directly.
          </p>
        </div>
        <div className="w-full rounded-2xl border border-zinc-200 bg-card p-6 dark:border-zinc-800">
          <ResendVerificationForm defaultEmail={email} />
        </div>
        <Link
          href="/login"
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-foreground">
        <MailIcon aria-hidden="true" className="size-6" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Check your email
        </h1>
        <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
          {email ? (
            <>
              We sent a verification link to{" "}
              <span className="font-medium text-foreground">{email}</span>.
            </>
          ) : (
            "We sent you a verification link."
          )}{" "}
          Click it to activate your account.
        </p>
      </div>
      <div className="w-full rounded-2xl border border-zinc-200 bg-card p-6 dark:border-zinc-800">
        <ResendVerificationForm defaultEmail={email} />
      </div>
      <Link
        href="/login"
        className="text-sm text-zinc-500 underline-offset-4 hover:text-foreground hover:underline dark:text-zinc-400"
      >
        Back to login
      </Link>
    </div>
  );
}
