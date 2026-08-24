/**
 * Read-side data access for History — the write side (creating
 * conversations, persisting messages, bumping `updated_at`) lives in
 * `app/api/chat/route.ts`. Both go through the same RLS-scoped server
 * client as everything else in `lib/supabase/` — ownership is enforced by
 * Postgres itself, never an application-level check, so these functions
 * can't be used to read another user's data no matter what id is passed.
 */

import { createClient } from "./server";
import type { LumoraUIMessage } from "@/lib/ai/tools";

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** The signed-in user's own conversations, most recently updated first. */
export async function listConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[conversations] failed to list conversations:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  }));
}

/**
 * A conversation's messages, oldest first, ready to seed `useChat`'s
 * initial state — or `null` if `conversationId` doesn't exist or doesn't
 * belong to the signed-in user. Those two cases are deliberately
 * indistinguishable (both come back as "no row" under RLS), the same
 * non-leaking shape `app/api/chat/route.ts` already uses for the same
 * reason.
 *
 * The explicit existence check below (rather than just querying `messages`
 * directly and treating an empty result as "not found") is what lets the
 * caller tell "a conversation with no messages yet" apart from "not yours"
 * — querying `messages` alone can't distinguish those, since RLS makes
 * both come back empty.
 */
export async function getConversationMessages(
  conversationId: string,
): Promise<LumoraUIMessage[] | null> {
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .single();
  if (!conversation) return null;

  const { data, error } = await supabase
    .from("messages")
    .select("id, role, parts")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[conversations] failed to load messages:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    role: row.role as LumoraUIMessage["role"],
    parts: row.parts as LumoraUIMessage["parts"],
  }));
}
