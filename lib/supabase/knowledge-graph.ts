/**
 * Read-side data access for Explore's knowledge graph, plus the one
 * route-handler write helper (`upsertKnowledgeNodeActivity`) — same split as
 * `lib/supabase/conversations.ts`: a write that happens inside
 * `app/api/chat/route.ts` (which already has its own `supabase`/`userId` in
 * scope from persisting the chat message) lives here as a plain function
 * rather than in a separate "use server" file, since it isn't meant to be
 * client-invokable on its own. Client-invoked mutations (delete, reset) are
 * in `lib/supabase/knowledge-graph-actions.ts` instead.
 *
 * Every query goes through the RLS-scoped server client — "only the signed
 * -in user's own rows" is enforced by Postgres itself
 * (`supabase/schema.sql`'s `knowledge_nodes` policies), not application logic.
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
 * never included — see app/explore/data.ts's CENTRAL_NODE). Empty array —
 * never a throw — when there's no signed-in user or the query fails. */
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

// "manual" — added directly via the addKnowledgeTopic tool, with no quiz or
// flashcard set attached — never bumps quiz_count/flashcard_count, only
// activity_count/last_studied_at (see the branches below).
export type KnowledgeActivityKind = "quiz" | "flashcards" | "manual";

interface UpsertKnowledgeNodeActivityInput {
  label: string;
  kind: KnowledgeActivityKind;
  relatedTopics?: string[];
  // The broader field `label` belongs under (e.g. label "Binary Search
  // Trees", category "Data Structures and Algorithms") — see
  // findOrCreateCategoryNode below for how this gets resolved into a
  // parent, auto-creating the category node itself the first time it's
  // needed rather than requiring the user to have studied it directly first.
  category?: string;
  // Shown in TopicPanel when present. createQuiz/createFlashcards never
  // supply one; addKnowledgeTopic can. On an existing node, a new non-empty
  // summary replaces the old one; omitting it leaves whatever's already
  // there untouched (never blanked out by a call that didn't supply one).
  summary?: string;
}

/**
 * Called from `app/api/chat/route.ts`'s `onEnd` for every `createQuiz`/
 * `createFlashcards`/`addKnowledgeTopic` tool output in a finished turn.
 * Never throws — logs and returns on any failure, exactly like the rest of
 * `onEnd`'s persistence calls, so a knowledge-graph write never affects the
 * chat response already streamed to the client.
 */
type ExistingNodeRow = {
  id: string;
  topic_key: string;
  related_labels: string[];
  activity_count: number;
  quiz_count: number;
  flashcard_count: number;
  summary: string | null;
};

/**
 * Resolves `category` into a parent node id, creating that node first if it
 * doesn't exist yet — this is what lets a subtopic (e.g. "Binary Search
 * Trees") nest under its broader field (e.g. "Data Structures and
 * Algorithms") even the very first time it's studied, without the user
 * needing to have studied the broader field directly first. The created
 * category node starts at activity_count 0 (it wasn't itself studied, just
 * inferred) — its own count grows normally if the user later studies it
 * directly. Returns `null` if creating it fails; the caller falls back to
 * its other parent-detection logic in that case, never blocking the actual
 * topic from being saved.
 */
async function findOrCreateCategoryNode(
  supabase: SupabaseClient<Database>,
  userId: string,
  category: string,
  existingNodes: ExistingNodeRow[],
): Promise<string | null> {
  const categoryKey = normalizeTopicKey(category);
  if (!categoryKey) return null;

  const existing = existingNodes.find((node) => node.topic_key === categoryKey);
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

export async function upsertKnowledgeNodeActivity(
  supabase: SupabaseClient<Database>,
  userId: string,
  { label, kind, relatedTopics, category, summary }: UpsertKnowledgeNodeActivityInput,
): Promise<void> {
  const topicKey = normalizeTopicKey(label);
  if (!topicKey) return;

  const { data: existingNodes, error: listError } = await supabase
    .from("knowledge_nodes")
    .select("id, topic_key, related_labels, activity_count, quiz_count, flashcard_count, summary")
    .eq("user_id", userId);

  if (listError || !existingNodes) {
    if (listError) {
      console.error("[knowledge-graph] failed to read existing nodes:", listError.message);
    }
    return;
  }

  const existing = existingNodes.find((node) => node.topic_key === topicKey);
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

  // New topic: prefer the model's own explicit category (auto-creating that
  // node if it doesn't exist yet — see findOrCreateCategoryNode), since
  // that's a deliberate categorization rather than an incidental mention.
  // Falls back to whichever existing node first suggested this one (a
  // case-insensitive match in that node's related_labels), or leaves it
  // top-level (attached to Core) if neither applies.
  let parentId: string | null = null;
  const categoryKey = category ? normalizeTopicKey(category) : null;
  if (categoryKey && categoryKey !== topicKey) {
    parentId = await findOrCreateCategoryNode(supabase, userId, category!, existingNodes);
  }
  if (parentId === null) {
    const relatedParent = existingNodes.find((node) =>
      node.related_labels.some((related) => normalizeTopicKey(related) === topicKey),
    );
    parentId = relatedParent?.id ?? null;
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
