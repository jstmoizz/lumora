"use server";

/**
 * Every auth-related Server Action Lumora's forms call. Centralized in one
 * file (rather than scattered per-route `actions.ts` files) so the
 * security audit only has one place to check for role-writes, redirect
 * targets, and how identity is derived — see `promoteIfConfiguredAdmin` in
 * `lib/supabase/admin.ts` for the one place `role` is ever written.
 *
 * None of these accept or trust a client-supplied user id or role: identity
 * always comes from what Supabase's own auth response returns, and role is
 * never a form field.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { promoteIfConfiguredAdmin } from "./admin";
import { getSafeRedirect } from "./redirect";
import { createClient } from "./server";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NETWORK_ERROR =
  "Couldn't reach the server. Check your connection and try again.";
const MIN_PASSWORD_LENGTH = 8;

// `AuthError.status` is documented as `undefined` specifically for errors
// that occurred before a response was received — i.e. a network failure —
// as opposed to every other case, which has a real HTTP status attached.
function isNetworkFailure(error: { status?: number }) {
  return error.status === undefined;
}

async function getOrigin() {
  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  return `${protocol}://${host}`;
}

export interface AuthActionState {
  error: string | null;
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = getSafeRedirect(
    formData.get("redirectTo") as string | null,
    "/generate",
  );

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (isNetworkFailure(error)) {
      return { error: NETWORK_ERROR };
    }
    if (error.code === "email_not_confirmed") {
      return {
        error:
          "Verify your email before signing in — check your inbox, or request a new link from the verification page.",
      };
    }
    // Deliberately the same message for wrong password, no such account,
    // etc. — distinguishing them would let an attacker enumerate which
    // emails have accounts.
    return { error: "Invalid email or password." };
  }

  if (data.user?.email) {
    await promoteIfConfiguredAdmin(data.user.id, data.user.email);
  }

  redirect(redirectTo);
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!email || !password || !confirmPassword) {
    return { error: "Fill in every field." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (isNetworkFailure(error)) {
      return { error: NETWORK_ERROR };
    }
    if (error.code === "weak_password") {
      return { error: "That password is too weak. Try a longer or more varied one." };
    }
    if (error.code === "email_address_invalid") {
      return { error: "Enter a valid email address." };
    }
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { error: "An account with this email already exists. Try signing in instead." };
    }
    return { error: GENERIC_ERROR };
  }

  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export interface RequestPasswordResetState {
  error: string | null;
  success: boolean;
}

export async function requestPasswordReset(
  _prevState: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Enter your email address.", success: false };
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  if (error) {
    if (isNetworkFailure(error)) {
      return { error: NETWORK_ERROR, success: false };
    }
    if (error.code === "email_address_invalid") {
      return { error: "Enter a valid email address.", success: false };
    }
    if (error.code === "over_email_send_rate_limit") {
      return { error: "Please wait a bit before requesting another email.", success: false };
    }
    // Any other failure (including "no account for this email", which
    // Supabase itself doesn't distinguish here) still reports success —
    // never confirm or deny whether an account exists for this address.
    return { error: null, success: true };
  }

  return { error: null, success: true };
}

export interface UpdatePasswordState {
  error: string | null;
}

export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password || !confirmPassword) {
    return { error: "Fill in both fields." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (isNetworkFailure(error)) {
      return { error: NETWORK_ERROR };
    }
    if (error.code === "same_password") {
      return { error: "That's your current password — choose a different one." };
    }
    if (error.code === "weak_password") {
      return { error: "That password is too weak. Try a longer or more varied one." };
    }
    // No valid (recovery) session is the other realistic cause here.
    return {
      error:
        "This password reset link is invalid or has expired. Request a new one from the Forgot Password page.",
    };
  }

  redirect("/generate");
}

export interface ResendVerificationState {
  error: string | null;
  success: boolean;
}

export async function resendVerificationEmail(
  _prevState: ResendVerificationState,
  formData: FormData,
): Promise<ResendVerificationState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Enter your email address.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });

  if (error) {
    if (isNetworkFailure(error)) {
      return { error: NETWORK_ERROR, success: false };
    }
    if (error.code === "over_email_send_rate_limit") {
      return { error: "Please wait a bit before requesting another email.", success: false };
    }
    // Same reasoning as password reset: don't let this reveal whether the
    // address has an account or is already verified.
    return { error: null, success: true };
  }

  return { error: null, success: true };
}
