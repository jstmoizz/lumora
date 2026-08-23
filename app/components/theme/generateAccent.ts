/**
 * Generate's accent-theme system: a small, Generate-scoped color layer that
 * sits *on top of* the global Light/Dark system above (theme.ts) rather
 * than replacing or competing with it. Deliberately mirrors theme.ts's own
 * shape (a storage key, a validity guard, get/apply helpers) since it's
 * solving the same kind of problem — a user-chosen preference, persisted in
 * localStorage, applied by toggling a DOM attribute — just for a single
 * page's decorative accent instead of the whole app's light/dark palette.
 *
 * Colocated here (not under app/generate/) because, like theme.ts, it's now
 * read from two different routes: GenerateWorkspace.tsx (which applies it)
 * and SettingsClient.tsx (which lets the user change it) — see
 * generate-accent.css for the actual color tokens each value below unlocks.
 */

export type GenerateAccent =
  | "indigo"
  | "purple"
  | "pink"
  | "blue"
  | "cyan"
  | "green"
  | "teal"
  | "amber"
  | "red"
  | "violet";

export const GENERATE_ACCENT_STORAGE_KEY = "lumora-generate-accent";

export const DEFAULT_GENERATE_ACCENT: GenerateAccent = "indigo";

// Order here is the order both the palette table in generate-accent.css and
// the Settings dropdown render in — keep the three in sync if this changes.
export const GENERATE_ACCENTS: { value: GenerateAccent; label: string }[] = [
  { value: "indigo", label: "Indigo" },
  { value: "purple", label: "Purple" },
  { value: "pink", label: "Pink" },
  { value: "blue", label: "Blue" },
  { value: "cyan", label: "Cyan" },
  { value: "green", label: "Green" },
  { value: "teal", label: "Teal" },
  { value: "amber", label: "Amber" },
  { value: "red", label: "Red" },
  { value: "violet", label: "Violet" },
];

const GENERATE_ACCENT_VALUES = new Set<string>(
  GENERATE_ACCENTS.map((accent) => accent.value),
);

export function isGenerateAccent(value: string): value is GenerateAccent {
  return GENERATE_ACCENT_VALUES.has(value);
}

export function getStoredGenerateAccent(): GenerateAccent {
  if (typeof window === "undefined") return DEFAULT_GENERATE_ACCENT;
  try {
    const stored = window.localStorage.getItem(GENERATE_ACCENT_STORAGE_KEY);
    return stored && isGenerateAccent(stored) ? stored : DEFAULT_GENERATE_ACCENT;
  } catch {
    // Private browsing / storage disabled — fall back to the default rather
    // than throwing, same reasoning as getStoredThemePreference.
    return DEFAULT_GENERATE_ACCENT;
  }
}

/**
 * Persists the chosen accent. Unlike applyThemePreference, this never
 * touches the DOM itself — the accent only ever affects one page
 * (`/generate`), which owns applying `data-generate-accent` to its own
 * subtree (see GenerateWorkspace.tsx) rather than this module reaching into
 * a `document.documentElement` that most callers (Settings) aren't even
 * rendering alongside.
 */
export function applyGenerateAccent(accent: GenerateAccent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GENERATE_ACCENT_STORAGE_KEY, accent);
  } catch {
    // Ignore storage failures — the caller's own state still reflects the
    // choice for this page view, it just won't persist across reloads.
  }
}
