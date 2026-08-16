"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/generate", label: "Generate" },
  { href: "/explore", label: "Explore" },
  { href: "/history", label: "History" },
  { href: "/about", label: "About" },
  { href: "/settings", label: "Settings" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
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
  );
}
