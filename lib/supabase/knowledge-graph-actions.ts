"use server";

/**
 * Client-invoked mutations on the knowledge graph, separate from
 * `lib/supabase/knowledge-graph.ts`'s read/route-handler-write access.
 *
 * Identity always comes from `getServerUser()`, never an argument — a
 * Server Action is still a network-callable endpoint, and RLS backs this
 * up at the database level regardless.
 */

import { createClient, getServerUser } from "./server";

export interface KnowledgeGraphActionResult {
  ok: boolean;
}

// Deletes one node and, via `on delete cascade`, its entire subtree — no
// orphaned children left behind. No "is this Lumora Core" check needed,
// since Core is never a row that could be passed here.
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

/**
 * Persists one node's manually-dragged position. Called once per completed
 * drag, never per pointer-move. Upserts on `node_id`, so re-dragging the
 * same node overwrites rather than accumulating rows. RLS's insert policy
 * already requires the node to belong to the caller — this function's own
 * `user_id` scoping is a fast path, not the real security boundary.
 */
export async function saveKnowledgeNodePosition(
  nodeId: string,
  position: [number, number, number],
): Promise<KnowledgeGraphActionResult> {
  const user = await getServerUser();
  if (!user) return { ok: false };

  const [positionX, positionY, positionZ] = position;
  const supabase = await createClient();
  const { error } = await supabase.from("knowledge_node_positions").upsert(
    {
      node_id: nodeId,
      user_id: user.id,
      position_x: positionX,
      position_y: positionY,
      position_z: positionZ,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "node_id" },
  );

  if (error) {
    console.error("[knowledge-graph] failed to save node position:", error.message);
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
