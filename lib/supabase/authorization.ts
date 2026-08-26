/**
 * Server-side authorization building blocks. `requireAdmin()` has no
 * caller yet — there's no admin functionality to protect, just the
 * foundation for whenever one exists. All three read identity from the
 * authenticated Supabase session, never a client-supplied user id.
 */

import { createClient, getServerUser } from "./server";

export interface CurrentProfile {
  id: string;
  email: string;
  role: "user" | "admin";
}

// Uses the RLS-scoped client, not the service-role client — reading your
// own profile is exactly what the "view own profile" policy allows.
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
