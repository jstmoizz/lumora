/**
 * Client-safe chat-mode and image-attachment constants.
 *
 * Kept in its own module rather than inline in `lib/ai/config.ts` so it has
 * no server-only dependencies — no provider client, no env vars, no raw
 * model ID strings — and can be safely imported from client components
 * (e.g. the Settings page, the Generate composer) that need mode labels or
 * image-validation limits without pulling in `@ai-sdk/groq` or anything
 * that reads `GROQ_API_KEY`. Actual provider model IDs live only in
 * `lib/ai/config.ts`, which must stay server-only.
 *
 * Single source of truth for these limits — the composer's client-side
 * validation and the chat route's server-side validation both import from
 * here, so the two can't drift apart.
 */

export type ChatMode = "auto" | "fast" | "vision";

export const DEFAULT_CHAT_MODE: ChatMode = "auto";

// Copy describes capability, not provider — the user is picking what they
// want done, not which model does it (see ChatInterface.tsx's ExtractionCard/
// pending-status copy for the same principle applied to in-progress turns).
export const CHAT_MODES: Record<ChatMode, { label: string; description: string }> = {
  auto: {
    label: "Auto",
    description: "Best model for the task",
  },
  fast: {
    label: "Fast",
    description: "Fastest text responses",
  },
  vision: {
    label: "Vision",
    description: "Analyze images and visual content",
  },
};

export const MAX_IMAGES_PER_MESSAGE = 1;

// Vercel Functions enforce a hard, unconfigurable 4.5MB request body limit —
// a base64-encoded image runs ~33% larger than its raw size, so this stays
// well under that ceiling with room for the rest of the message/history.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export const ALLOWED_IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
