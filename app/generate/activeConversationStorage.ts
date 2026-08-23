const ACTIVE_CONVERSATION_KEY = "lumora-active-conversation-id";

// `sessionStorage`, not `localStorage`: it's naturally scoped to one browser
// tab, which is exactly what "the ongoing conversation survives navigating
// away and back, or a refresh, but a brand-new tab starts its own session"
// needs — no per-tab bookkeeping to build by hand. The rest of the app's one
// existing storage precedent (theme.ts) is a global `localStorage` key on
// purpose (theme should be shared across tabs); this is deliberately the
// opposite choice for the opposite reason. Guarded the same way theme.ts
// guards its reads/writes, since private browsing can make storage throw.

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
