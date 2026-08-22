import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` (the
// exported function follows suit, `middleware` -> `proxy`) — this is that
// file under its current name, not a leftover/duplicate.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Runs on every route except static assets and Next's own internals —
  // those never need a session refresh or an auth redirect decision.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
