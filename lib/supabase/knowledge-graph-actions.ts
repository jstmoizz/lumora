"use server";

/**
 * The two client-invoked mutations on `knowledge_nodes` — kept narrowly
 * scoped and separate from `lib/supabase/knowledge-graph.ts`'s read/route-
 * handler-write access, same split as `topic-progress-actions.ts` vs.
 * `topic-progress.ts` before it.
 *
 * Identity always comes from `getServerUser()`, never from an argument —
 * RLS also enforces this at the database level, but both layers agree on
 * purpose: a Server Action is still a network-callable endpoint underneath.
 */

import { createClient, getServerUser } from "./server";

export interface KnowledgeGraphActionResult {
  ok: boolean;
}

/**
 * Deletes one node and, via `parent_id ... on delete cascade`, its entire
 * subtree — the simplest correct behavior for "remove this topic and its
 * edges" (no orphaned/reparented children left behind). RLS already scopes
 * this to the caller's own rows; there's no separate "is this Lumora Core"
 * check needed since Core is never a row that could be passed here.
 */
export async function deleteKnowledgeNode(nodeId: string): Promise<KnowledgeGraphActionResult> {
  const user = await getServerUser();
  if (!user) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_nodes")
    .delete()
    .eq("id", nodeId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[knowledge-graph] failed to delete node:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/** Deletes every node the signed-in user has — the graph returns to just
 * Lumora Core, which was never a row to begin with. */
export async function resetKnowledgeGraph(): Promise<KnowledgeGraphActionResult> {
  const user = await getServerUser();
  if (!user) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("knowledge_nodes").delete().eq("user_id", user.id);

  if (error) {
    console.error("[knowledge-graph] failed to reset graph:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
