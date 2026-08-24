"use client";

import ProfileCard from "./ProfileCard";
import SocialLinks from "./SocialLinks";
import "./DeveloperCredit.css";

// A background-removed cutout (real alpha, not a flattened photo) so the
// card's own --inner-gradient shows through around the subject instead of
// a mismatched photo background — same effect as ProfileCard's own demo
// images. Must stay a PNG (or another alpha-capable format); a JPEG here
// would silently flatten the transparency to opaque white/black.
const AVATAR_URL = "/about/developer-photo.png";

// Lumora's own indigo -> violet gradient (the same three-stop brand
// identity as LumoraMark.css / the Home hero shader / Explore's knowledge
// graph) in place of the component's default blue/purple demo colors — the
// holographic "shine" foil on hover stays as-given, since that effect is
// inherently rainbow and isn't a brand-color choice.
const INNER_GRADIENT = "linear-gradient(145deg, #4338ca8c 0%, #a78bfa44 100%)";
const BEHIND_GLOW_COLOR = "rgba(147, 130, 230, 0.55)";

// No handle/status/contact-button copy exists, so `showUserInfo` stays off
// rather than showing a fabricated "@handle" or a non-functional Contact
// button — GitHub/LinkedIn are real links, so those go below the card
// instead as plain icon links.
export default function DeveloperCredit() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="w-full max-w-[280px]">
        <ProfileCard
          avatarUrl={AVATAR_URL}
          name="Abdul M. Iqbal"
          title="Software Engineer"
          showUserInfo={false}
          innerGradient={INNER_GRADIENT}
          behindGlowColor={BEHIND_GLOW_COLOR}
          className="developer-credit-card"
        />
      </div>
      <SocialLinks />
    </div>
  );
}
