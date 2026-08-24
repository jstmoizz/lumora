import { useId } from "react";
import { cn } from "@/lib/utils";
import "./LumoraMark.css";

/**
 * Lumora's icon mark: a five-node network/flower glyph. Colors come from
 * LumoraMark.css's custom properties (indigo -> violet -> pink), defined on
 * the `.lumora-brand` ancestor so the wordmark text next to it can share
 * them too — this must render inside a `.lumora-brand` element.
 *
 * `useId()` keeps the gradient's id collision-safe if this ever renders
 * more than once on a page.
 */
export default function LumoraMark({ className }: { className?: string }) {
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={cn("lumora-mark shrink-0", className)}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="4"
          y1="4"
          x2="36"
          y2="36"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" style={{ stopColor: "var(--mark-start)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--mark-mid)" }} />
          <stop offset="1" style={{ stopColor: "var(--mark-end)" }} />
        </linearGradient>
      </defs>

      {/* Top petal: the curve through center, then the outer arc. */}
      <path
        d="M 8 11 C 13 17 16 19 20 20 C 24 19 27 15 31 9"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M 8 11 C 11 1 29 1 31 9"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* Bottom petal: mirrors the top petal. */}
      <path
        d="M 9 31 C 14 25 17 22 20 20 C 23 22 26 26 31 32"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M 9 31 C 11 39 29 39 31 32"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      <circle cx="8" cy="11" r="2.3" fill="var(--mark-start)" />
      <circle cx="31" cy="9" r="2.3" fill="var(--mark-end)" />
      <circle cx="20" cy="20" r="2.6" fill="var(--mark-mid)" />
      <circle cx="9" cy="31" r="2.3" fill="var(--mark-start)" />
      <circle cx="31" cy="32" r="2.3" fill="var(--mark-end)" />
    </svg>
  );
}
