import Link from "next/link";
import { signOut } from "@/lib/supabase/actions";

// The header's account controls only — the route-nav links (Home/
// Generate/Explore/History/About/Settings) that used to live alongside
// this in NavBar.tsx are gone; GlobalDock is the app's primary navigation
// now (see app/components/GlobalDock.tsx). This no longer needs
// `usePathname()` for anything, so it's a plain server component rendered
// directly from the root layout.
export default function HeaderAccount({
  userEmail,
}: {
  userEmail: string | null;
}) {
  return (
    <div aria-label="Account" className="flex items-center gap-3 text-sm">
      {userEmail ? (
        <>
          <span
            className="max-w-32 truncate text-muted-foreground"
            title={userEmail}
          >
            {userEmail}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
            >
              Log out
            </button>
          </form>
        </>
      ) : (
        <>
          <Link
            href="/login"
            className="text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="font-medium text-foreground transition-opacity duration-150 ease-out hover:opacity-80"
          >
            Sign up
          </Link>
        </>
      )}
    </div>
  );
}
