"use client";

import ProfileCard from "./ProfileCard";
import SocialLinks from "./SocialLinks";
import "./DeveloperCredit.css";

// Background-removed PNG (real alpha) so --inner-gradient shows through
// around the subject — must stay alpha-capable, or a JPEG would flatten the
// transparency to opaque.
const AVATAR_URL = "/about/developer-photo.png";

// Lumora's indigo -> violet brand gradient, replacing the component's
// default blue/purple demo colors. The holographic shine foil stays
// as-given — it's inherently rainbow, not a brand-color choice.
const INNER_GRADIENT = "linear-gradient(145deg, #4338ca8c 0%, #a78bfa44 100%)";
const BEHIND_GLOW_COLOR = "rgba(147, 130, 230, 0.55)";

// No handle/status/contact copy exists, so `showUserInfo` stays off instead
// of showing a fabricated "@handle" or a dead Contact button — GitHub/
// LinkedIn render as real links below the card instead.
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
