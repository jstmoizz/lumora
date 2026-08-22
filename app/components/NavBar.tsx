"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/supabase/actions";

const links = [
  { href: "/", label: "Home" },
  { href: "/generate", label: "Generate" },
  { href: "/explore", label: "Explore" },
  { href: "/history", label: "History" },
  { href: "/about", label: "About" },
  { href: "/settings", label: "Settings" },
];

export default function NavBar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
      <nav
        aria-label="Main"
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
      >
        {links.map(({ href, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "text-sm font-semibold text-foreground"
                  : "text-sm text-zinc-500 transition-colors hover:text-foreground dark:text-zinc-400"
              }
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div
        aria-label="Account"
        className="flex items-center gap-3 border-t border-zinc-200 pt-3 text-sm sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6 dark:border-zinc-800"
      >
        {userEmail ? (
          <>
            <span
              className="max-w-32 truncate text-zinc-500 dark:text-zinc-400"
              title={userEmail}
            >
              {userEmail}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-zinc-500 transition-colors hover:text-foreground dark:text-zinc-400"
              >
                Log out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="text-zinc-500 transition-colors hover:text-foreground dark:text-zinc-400"
            >
              Log in
            </Link>
            <Link href="/signup" className="font-semibold text-foreground">
              Sign up
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
