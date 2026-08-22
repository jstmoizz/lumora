import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { promoteIfConfiguredAdmin } from "@/lib/supabase/admin";
import { getSafeRedirect } from "@/lib/supabase/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Destination for both of Lumora's Supabase email links (signup
 * confirmation and password recovery) once their templates are pointed
 * here — see the manual dashboard setup this needs, documented in the
 * Phase 2 report. Uses Supabase's own token-verification flow
 * (`verifyOtp`), never a custom verification-token implementation.
 *
 * The two link types share this one handler because they do the same
 * thing structurally (verify a token, establish a session, redirect) and
 * only differ in `type` and where they go next:
 *   - `type=email`    — signup confirmation. Redirects to /verify with a
 *                        status flag; this is also the point at which the
 *                        one configured admin email gets promoted, since
 *                        the email is now provably verified.
 *   - `type=recovery` — password reset. Redirects to /reset-password
 *                        (via `next`, sanitized), where a valid session —
 *                        established right here — lets the user set a new
 *                        password.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = getSafeRedirect(searchParams.get("next"), "/");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      if (type === "email" && data.user?.email) {
        await promoteIfConfiguredAdmin(data.user.id, data.user.email);
      }

      if (type === "recovery") {
        redirect(next);
      }

      redirect("/verify?status=success");
    }
  }

  redirect("/verify?status=error");
}
