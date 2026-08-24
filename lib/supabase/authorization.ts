/**
 * Server-side authorization building blocks. Nothing in the app calls
 * `requireAdmin()` yet — there's no admin functionality to protect — this
 * is deliberately just the foundation, ready for whichever future
 * route/action needs it.
 *
 * All three read identity from the authenticated Supabase session (via
 * `getServerUser()`, which re-validates against Supabase rather than
 * trusting a cookie) — never from a client-supplied user id.
 */

import { createClient, getServerUser } from "./server";

export interface CurrentProfile {
  id: string;
  email: string;
  role: "user" | "admin";
}

/**
 * The signed-in user's own `public.users` row, or `null` if no one's
 * signed in. Uses the RLS-scoped server client (not the service-role
 * client) — a user reading their own profile is exactly what the
 * "Users can view own profile" policy in `supabase/schema.sql` allows, so
 * there's no reason to reach for the privileged client here.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const user = await getServerUser();
  if (!user || !user.email) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, role")
    .eq("id", user.id)
    .single();

  return data;
}

/** Throws if no one is signed in; otherwise returns the Supabase user. */
export async function requireUser() {
  const user = await getServerUser();
  if (!user) {
    throw new Error("Unauthorized: no authenticated user.");
  }
  return user;
}

/** Throws unless the signed-in user's profile has `role = "admin"`. */
export async function requireAdmin(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Forbidden: admin role required.");
  }
  return profile;
}
