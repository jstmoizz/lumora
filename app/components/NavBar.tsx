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
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
      <nav
        aria-label="Main"
        className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1"
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
                  ? "rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground"
                  : "rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground"
              }
            >
              {/*
                A short underline anchored to the accent color, not a
                filled pill or a bare font-weight/color swap — reads as
                "you are here" at a glance without looking like a button.
              */}
              <span
                className={
                  isActive
                    ? "border-b-2 border-primary pb-0.5"
                    : "border-b-2 border-transparent pb-0.5"
                }
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div
        aria-label="Account"
        className="flex items-center gap-3 border-t border-border pt-3 text-sm sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5"
      >
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
    </div>
  );
}
