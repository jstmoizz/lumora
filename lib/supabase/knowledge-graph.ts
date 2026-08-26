/**
 * Read-side data access for Explore's knowledge graph, plus one
 * route-handler write helper (`upsertKnowledgeNodeActivity`) not meant to
 * be client-invokable on its own. Client-invoked mutations (delete, reset)
 * are in `lib/supabase/knowledge-graph-actions.ts` instead.
 *
 * Every query goes through the RLS-scoped server client — access is
 * enforced by Postgres itself, not application logic.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, getServerUser } from "./server";
import type { Database } from "./types";
import type { KnowledgeGraphNode } from "@/app/explore/data";
import { normalizeTopicKey } from "@/lib/knowledge-graph/topics";

const RELATED_LABELS_CAP = 6;

function rowToNode(
  row: Omit<Database["public"]["Tables"]["knowledge_nodes"]["Row"], "user_id">,
): KnowledgeGraphNode {
  return {
    id: row.id,
    topicKey: row.topic_key,
    label: row.label,
    summary: row.summary,
    parentId: row.parent_id,
    relatedLabels: row.related_labels,
    activityCount: row.activity_count,
    quizCount: row.quiz_count,
    flashcardCount: row.flashcard_count,
    createdAt: row.created_at,
    lastStudiedAt: row.last_studied_at,
  };
}

/** The signed-in user's whole knowledge graph (Lumora Core is virtual and
 * never included). Empty array — never a throw — on no user or a failed query. */
export async function getKnowledgeGraph(): Promise<KnowledgeGraphNode[]> {
  const user = await getServerUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_nodes")
    .select(
      "id, topic_key, label, summary, parent_id, related_labels, activity_count, quiz_count, flashcard_count, created_at, last_studied_at",
    )
    .eq("user_id", user.id);

  if (error || !data) {
    if (error) {
      console.error("[knowledge-graph] failed to load knowledge graph:", error.message);
    }
    return [];
  }

  return data.map(rowToNode);
}

/** The signed-in user's manually-dragged node positions, keyed by node id —
 * only dragged nodes have an entry; everything else uses the automatic
 * layout. Empty object — never a throw — on no user, a failed query, or a
 * missing table (an older database not yet migrated). */
export async function getKnowledgeNodePositions(): Promise<
  Record<string, [number, number, number]>
> {
  const user = await getServerUser();
  if (!user) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_node_positions")
    .select("node_id, position_x, position_y, position_z")
    .eq("user_id", user.id);

  if (error || !data) {
    if (error) {
      console.error("[knowledge-graph] failed to load node positions:", error.message);
    }
    return {};
  }

  const positions: Record<string, [number, number, number]> = {};
  for (const row of data) {
    positions[row.node_id] = [row.position_x, row.position_y, row.position_z];
  }
  return positions;
}

// "manual" — added via the addKnowledgeTopic tool with no quiz/flashcard
// set attached — bumps activity_count/last_studied_at only.
export type KnowledgeActivityKind = "quiz" | "flashcards" | "manual";

interface UpsertKnowledgeNodeActivityInput {
  label: string;
  kind: KnowledgeActivityKind;
  relatedTopics?: string[];
  // The broader field `label` belongs under — resolved into a parent by
  // findOrCreateCategoryNode below, auto-creating it if needed.
  category?: string;
  // Shown in TopicPanel when present. A new non-empty summary replaces the
  // old one; omitting it leaves the existing summary untouched.
  summary?: string;
}

/**
 * Resolves `category` into a parent node id, creating it first if needed —
 * lets a subtopic nest under its broader field even the first time it's
 * studied. Returns `null` on failure, so the caller can fall back instead
 * of blocking the topic from being saved. Looks the category up by its own
 * topic_key rather than scanning the whole graph.
 */
async function findOrCreateCategoryNode(
  supabase: SupabaseClient<Database>,
  userId: string,
  category: string,
): Promise<string | null> {
  const categoryKey = normalizeTopicKey(category);
  if (!categoryKey) return null;

  const { data: existing, error: lookupError } = await supabase
    .from("knowledge_nodes")
    .select("id")
    .eq("user_id", userId)
    .eq("topic_key", categoryKey)
    .maybeSingle();

  if (lookupError) {
    console.error("[knowledge-graph] failed to look up category node:", lookupError.message);
    return null;
  }
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("knowledge_nodes")
    .insert({
      user_id: userId,
      topic_key: categoryKey,
      label: category.trim(),
      parent_id: null,
      related_labels: [],
      activity_count: 0,
      quiz_count: 0,
      flashcard_count: 0,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error) {
      console.error("[knowledge-graph] failed to create category node:", error.message);
    }
    return null;
  }
  return data.id;
}

// The related_labels fallback (below) can't be scoped to one row — it's
// matching normalizeTopicKey() against every existing node's labels, which
// Postgres has no column to filter on directly. Only reached for a brand-new
// topic with no (or unresolved) category, so it's not on every write.
async function findRelatedParent(
  supabase: SupabaseClient<Database>,
  userId: string,
  topicKey: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("knowledge_nodes")
    .select("id, related_labels")
    .eq("user_id", userId);

  if (error || !data) {
    if (error) {
      console.error("[knowledge-graph] failed to look up a related parent:", error.message);
    }
    return null;
  }

  const relatedParent = data.find((node) =>
    node.related_labels.some((related) => normalizeTopicKey(related) === topicKey),
  );
  return relatedParent?.id ?? null;
}

// Called from app/api/chat/route.ts's onStepEnd for each createQuiz/
// createFlashcards/addKnowledgeTopic tool output. Never throws — a failed
// write must never affect the chat response already streamed to the client.
export async function upsertKnowledgeNodeActivity(
  supabase: SupabaseClient<Database>,
  userId: string,
  { label, kind, relatedTopics, category, summary }: UpsertKnowledgeNodeActivityInput,
): Promise<void> {
  const topicKey = normalizeTopicKey(label);
  if (!topicKey) return;

  // Scoped to the one topic being touched, not the whole graph — the common
  // case (studying a topic again) never needs more than this single row.
  const { data: existing, error: lookupError } = await supabase
    .from("knowledge_nodes")
    .select("id, related_labels, activity_count, quiz_count, flashcard_count, summary")
    .eq("user_id", userId)
    .eq("topic_key", topicKey)
    .maybeSingle();

  if (lookupError) {
    console.error("[knowledge-graph] failed to read existing node:", lookupError.message);
    return;
  }

  const newRelated = (relatedTopics ?? []).map((t) => t.trim()).filter(Boolean);
  const trimmedSummary = summary?.trim();

  if (existing) {
    const mergedRelated = Array.from(new Set([...existing.related_labels, ...newRelated])).slice(
      0,
      RELATED_LABELS_CAP,
    );
    const { error: updateError } = await supabase
      .from("knowledge_nodes")
      .update({
        activity_count: existing.activity_count + 1,
        quiz_count: existing.quiz_count + (kind === "quiz" ? 1 : 0),
        flashcard_count: existing.flashcard_count + (kind === "flashcards" ? 1 : 0),
        related_labels: mergedRelated,
        summary: trimmedSummary || existing.summary,
        last_studied_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updateError) {
      console.error("[knowledge-graph] failed to update node activity:", updateError.message);
    }
    return;
  }

  // New topic: prefer the model's explicit category, falling back to
  // whichever existing node first suggested this one, or top-level.
  let parentId: string | null = null;
  const categoryKey = category ? normalizeTopicKey(category) : null;
  if (categoryKey && categoryKey !== topicKey) {
    parentId = await findOrCreateCategoryNode(supabase, userId, category!);
  }
  if (parentId === null) {
    parentId = await findRelatedParent(supabase, userId, topicKey);
  }

  const { error: insertError } = await supabase.from("knowledge_nodes").insert({
    user_id: userId,
    topic_key: topicKey,
    label: label.trim(),
    parent_id: parentId,
    related_labels: newRelated.slice(0, RELATED_LABELS_CAP),
    summary: trimmedSummary || null,
    activity_count: 1,
    quiz_count: kind === "quiz" ? 1 : 0,
    flashcard_count: kind === "flashcards" ? 1 : 0,
  });
  if (insertError) {
    console.error("[knowledge-graph] failed to create node:", insertError.message);
  }
}
