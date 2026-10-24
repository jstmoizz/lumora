// Shared by the rename Server Action (lib/supabase/conversation-actions.ts)
// and the rename form, so client-side and server-side validation can't
// drift apart. Generated titles are capped at 60 characters plus an
// ellipsis (see app/api/chat/route.ts) — a little extra room here for a
// hand-written one.
export const CONVERSATION_TITLE_MAX_LENGTH = 80;

/** Trims and collapses whitespace — the same normalization generated titles get. */
export function normalizeConversationTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

/** A user-facing reason the title can't be saved, or `null` if it's fine. */
export function validateConversationTitle(title: string): string | null {
  const normalized = normalizeConversationTitle(title);
  if (!normalized) return "Enter a title.";
  if (normalized.length > CONVERSATION_TITLE_MAX_LENGTH) {
    return `Keep it under ${CONVERSATION_TITLE_MAX_LENGTH} characters.`;
  }
  return null;
}
