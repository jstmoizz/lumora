/**
 * Client-safe chat-mode and image-attachment constants — no provider
 * client, env vars, or model IDs, so client components can import mode
 * labels and image limits without pulling in `@ai-sdk/groq`. Also the
 * single source of truth these limits, shared by client- and server-side
 * validation so the two can't drift apart.
 */

export type ChatMode = "auto" | "fast" | "vision";

export const DEFAULT_CHAT_MODE: ChatMode = "auto";

// Copy describes capability, not provider — the user picks what they want
// done, not which model does it.
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

// Server-side resource caps for /api/chat — bound how much a single
// request can make the route (and the model behind it) do. Generous
// enough that no normal conversation ever hits them.
export const MAX_MESSAGES_PER_REQUEST = 100;
export const MAX_MESSAGE_TEXT_LENGTH = 8000;

// Vercel Functions enforce a hard, unconfigurable 4.5MB request body limit —
// a base64-encoded image runs ~33% larger than its raw size, so this stays
// well under that ceiling with room for the rest of the message/history.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export const ALLOWED_IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
