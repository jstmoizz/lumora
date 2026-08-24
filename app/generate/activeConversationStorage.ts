const ACTIVE_CONVERSATION_KEY = "lumora-active-conversation-id";

// `sessionStorage`, not `localStorage`: naturally scoped to one browser
// tab, so a conversation survives navigating away and back or a refresh,
// but a new tab starts fresh. theme.ts uses `localStorage` on purpose
// (shared across tabs) — this is the opposite choice for the opposite
// reason. Guarded the same way, since private browsing can make storage throw.

/** The active conversation id for this tab, or `null` if there isn't one. */
export function readActiveConversationId(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_CONVERSATION_KEY);
  } catch {
    return null;
  }
}

/** Pass `null` to clear (e.g. when the user starts a New Chat). */
export function writeActiveConversationId(id: string | null): void {
  try {
    if (id) {
      sessionStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
    } else {
      sessionStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    }
  } catch {
    // Storage disabled/unavailable — this is a same-tab convenience only,
    // never load-bearing for correctness (the URL's ?conversationId= and a
    // real page load still work without it).
  }
}
