"use server";

/**
 * Client-invoked mutations on a conversation (rename, delete), separate
 * from `lib/supabase/conversations.ts`'s read-only access. The chat route
 * still owns creating conversations and appending messages.
 *
 * Identity always comes from `getServerUser()`, never an argument — a
 * Server Action is still a network-callable endpoint, and RLS backs this
 * up at the database level regardless.
 */

import {
  normalizeConversationTitle,
  validateConversationTitle,
} from "@/lib/conversationTitle";
import { createClient, getServerUser } from "./server";

export interface ConversationActionResult {
  ok: boolean;
  /** Set on a failed rename whose input was rejected before reaching the database. */
  error?: string;
}

/**
 * Renames one of the caller's own conversations. Deliberately leaves
 * `updated_at` alone: a rename isn't study activity, so it shouldn't move
 * the conversation to the top of History or Recent Chats.
 */
export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<ConversationActionResult> {
  if (typeof title !== "string" || typeof conversationId !== "string") {
    return { ok: false, error: "That title isn't valid." };
  }

  const invalid = validateConversationTitle(title);
  if (invalid) return { ok: false, error: invalid };
  const normalized = normalizeConversationTitle(title);

  const user = await getServerUser();
  if (!user) return { ok: false };

  const supabase = await createClient();
  // `.select("id")` so a conversation that doesn't exist (or isn't the
  // caller's — RLS makes those indistinguishable) reports failure instead
  // of a silent zero-row success.
  const { data, error } = await supabase
    .from("conversations")
    .update({ title: normalized })
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("[conversations] failed to rename conversation:", error.message);
    return { ok: false };
  }
  return { ok: (data?.length ?? 0) > 0 };
}

/** Deletes one of the caller's own conversations; its messages and quiz attempts cascade with it. */
export async function deleteConversation(
  conversationId: string,
): Promise<ConversationActionResult> {
  if (typeof conversationId !== "string") return { ok: false };

  const user = await getServerUser();
  if (!user) return { ok: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("[conversations] failed to delete conversation:", error.message);
    return { ok: false };
  }
  return { ok: (data?.length ?? 0) > 0 };
}
