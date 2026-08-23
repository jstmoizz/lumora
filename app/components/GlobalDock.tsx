"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  CompassIcon,
  HistoryIcon,
  HomeIcon,
  InfoIcon,
  MessageCircleQuestionIcon,
  SettingsIcon,
} from "lucide-react";
import Dock, { type DockItemData } from "./Dock";
import { useReducedMotion } from "./useReducedMotion";

// The single source of truth for the app's primary navigation routes —
// previously duplicated as NavBar's own `links` array (now removed) and
// Home's page-local `dockItems`. Every nav surface in the app now reads
// from here instead of hand-rolling its own list.
const ROUTES = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/generate", label: "Generate", icon: MessageCircleQuestionIcon },
  { href: "/explore", label: "Explore", icon: CompassIcon },
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/about", label: "About", icon: InfoIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

// Lumora's primary, site-wide navigation (formerly the header's top nav —
// see NavBar.tsx, now account-controls-only). Mounted once in the root
// layout so it's present on every route. Uses the exact React Bits Dock
// implementation from app/components/Dock.tsx — this component only
// supplies the app-specific bits Dock itself has no opinion about: which
// routes exist, which one is current, and how motion should behave.
export default function GlobalDock() {
  const pathname = usePathname();
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const items: DockItemData[] = ROUTES.map(({ href, label, icon: Icon }) => ({
    icon: <Icon className="size-5" />,
    label,
    isActive: pathname === href,
    onClick: () => router.push(href),
  }));

  return (
    <Dock
      items={items}
      baseItemSize={44}
      panelHeight={56}
      // Reduced motion: magnification collapses to baseItemSize (no zoom)
      // and distance to 0 (no falloff to compute), rather than unmounting
      // the Dock — it's the app's primary navigation now, so it must stay
      // fully present and usable either way.
      magnification={reducedMotion ? 44 : 66}
      distance={reducedMotion ? 0 : 150}
    />
  );
}
