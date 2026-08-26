/**
 * Read-side data access for History — the write side lives in
 * app/api/chat/route.ts. Ownership is enforced by Postgres via RLS, never
 * an application-level check, so these functions can't leak another user's
 * data no matter what id is passed.
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
 * A conversation's messages, oldest first, or `null` if it doesn't exist or
 * doesn't belong to the signed-in user (indistinguishable under RLS). The
 * explicit existence check below is what lets "no messages yet" be told
 * apart from "not yours" — querying `messages` alone can't.
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
