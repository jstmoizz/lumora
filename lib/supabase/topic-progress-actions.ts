"use server";

/**
 * The one Server Action that writes to `topic_progress` — kept narrowly
 * scoped and separate from `lib/supabase/topic-progress.ts`'s read-only
 * data access, same split as `lib/supabase/settings-actions.ts` vs.
 * `lib/supabase/settings.ts`.
 *
 * Identity always comes from the authenticated session (`getServerUser()`),
 * never from an argument — there is no `userId` parameter for a caller to
 * supply. `topicId` is validated against the existing static topic ids
 * rather than trusted from the client purely via TypeScript's types: a
 * Server Action is still a network-callable endpoint underneath, reachable
 * with a hand-crafted request that ignores whatever the compiled client
 * code would ever actually send.
 */

import { createClient, getServerUser } from "./server";
import { KNOWLEDGE_NODES } from "@/app/explore/data";

const KNOWN_TOPIC_IDS = new Set(KNOWLEDGE_NODES.map((node) => node.id));

export interface RecordTopicStudiedResult {
  ok: boolean;
}

/**
 * Records that the signed-in user engaged with a topic in Explore:
 * increments `study_count` and stamps `last_studied_at`.
 *
 * Not atomic — this table has no Postgres function to increment in a
 * single statement, and adding one is a schema change out of scope for
 * this phase (see the Phase 4.2 report for the full note), so this reads
 * the current count and writes count + 1 in two round trips under the same
 * RLS-scoped session rather than a single atomic statement. Accepted here
 * because the only realistic race is the same signed-in user rapidly
 * re-triggering this from their own browser — not concurrent untrusted
 * writers — and an occasional missed increment on a personal familiarity
 * counter has no security or correctness consequence, unlike a balance or
 * inventory count. The caller (ExploreClient) also only invokes this once
 * per genuine topic *change*, not on every render or repeated selection of
 * the same topic, which keeps that residual race rare in practice.
 */
export async function recordTopicStudied(
  topicId: string,
): Promise<RecordTopicStudiedResult> {
  if (!KNOWN_TOPIC_IDS.has(topicId)) {
    return { ok: false };
  }

  const user = await getServerUser();
  if (!user) {
    return { ok: false };
  }

  const supabase = await createClient();

  const { data: existing, error: selectError } = await supabase
    .from("topic_progress")
    .select("study_count")
    .eq("user_id", user.id)
    .eq("topic_id", topicId)
    .maybeSingle();

  if (selectError) {
    console.error(
      `[topic-progress] failed to read progress for ${topicId}:`,
      selectError.message,
    );
    return { ok: false };
  }

  const nextCount = (existing?.study_count ?? 0) + 1;

  const { error: upsertError } = await supabase.from("topic_progress").upsert(
    {
      user_id: user.id,
      topic_id: topicId,
      study_count: nextCount,
      last_studied_at: new Date().toISOString(),
    },
    { onConflict: "user_id,topic_id" },
  );

  if (upsertError) {
    console.error(
      `[topic-progress] failed to record progress for ${topicId}:`,
      upsertError.message,
    );
    return { ok: false };
  }

  return { ok: true };
}
