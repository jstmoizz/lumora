"use client";

import { usePathname } from "next/navigation";

// Every route renders the footer directly above the fixed, floating
// GlobalDock — on normal scrolling pages that's fine (it's the last thing
// you scroll past). Generate is different: it's a fixed-height workspace
// with no page-level scroll (only the chat's own message list scrolls), so
// the footer just sits in the dead space behind the dock, never visible or
// reachable — reserving real vertical space the three-panel layout could
// use instead. Hidden there; present everywhere else.
export default function AppFooter() {
  const pathname = usePathname();
  if (pathname === "/generate") return null;

  return (
    <footer className="border-t border-border/60 px-6 py-6 text-center text-sm text-muted-foreground">
      &copy; {new Date().getFullYear()}{" "}
      <span className="font-wordmark text-base">Lumora</span>
    </footer>
  );
}
