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

// Single source of truth for the app's primary navigation routes.
const ROUTES = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/generate", label: "Generate", icon: MessageCircleQuestionIcon },
  { href: "/explore", label: "Explore", icon: CompassIcon },
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/about", label: "About", icon: InfoIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

// Lumora's primary, site-wide navigation. Mounted once in the root layout.
// Uses the React Bits Dock implementation in Dock.tsx — this component only
// supplies the app-specific bits: which routes exist, which is current, and
// how motion should behave.
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
      // Reduced motion: collapse magnification/distance to no-op values
      // rather than unmounting the Dock — it's primary navigation, so it
      // must stay present and usable either way.
      magnification={reducedMotion ? 44 : 66}
      distance={reducedMotion ? 0 : 150}
    />
  );
}
