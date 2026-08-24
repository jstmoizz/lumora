"use client";

import { usePathname } from "next/navigation";

// Every route renders the footer directly above the fixed, floating
// GlobalDock — on normal scrolling pages that's fine (it's the last thing
// you scroll past). Generate and Explore are different: both are
// fixed-height workspaces with no page-level scroll (Generate's chat list
// and Explore's topic list scroll themselves instead), so the footer would
// just sit in the dead space behind the dock, never visible or reachable —
// reserving real vertical space those layouts could use instead. Hidden on
// both; present everywhere else.
const NO_FOOTER_ROUTES = new Set(["/generate", "/explore"]);

export default function AppFooter() {
  const pathname = usePathname();
  if (NO_FOOTER_ROUTES.has(pathname)) return null;

  return (
    <footer className="border-t border-border/60 px-6 py-6 text-center text-sm text-muted-foreground">
      &copy; {new Date().getFullYear()}{" "}
      <span className="font-wordmark text-base">Lumora</span>
    </footer>
  );
}
