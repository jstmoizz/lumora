/**
 * Read-side data access for Explore's personal knowledge state (Phase 4.2).
 * The write side (recording that a topic was studied) is a Server Action in
 * `lib/supabase/topic-progress-actions.ts` — kept in a separate, "use
 * server" file rather than here, since anything exported from a "use
 * server" file becomes a network-callable endpoint; this module is only
 * ever imported by Server Components, so it stays a plain module, same as
 * `lib/supabase/conversations.ts` and `lib/supabase/settings.ts`.
 *
 * Every query here goes through the RLS-scoped server client — never the
 * service-role client — so "only the signed-in user's own rows" is
 * enforced by Postgres itself (`supabase/schema.sql`'s `topic_progress`
 * policies), not by application logic.
 */

import { createClient, getServerUser } from "./server";

export interface TopicProgress {
  topicId: string;
  studyCount: number;
  lastStudiedAt: string | null;
}

/**
 * The signed-in user's topic_progress rows, keyed by topic_id, for Explore
 * to layer onto the existing static KNOWLEDGE_NODES. Returns an empty
 * object — never `null` — when there's no signed-in user (shouldn't
 * happen, `/explore` is already protected, but this stays defensive rather
 * than assuming that guarantee always holds) or when nothing has been
 * studied yet: every consumer already treats "no entry for this topic" as
 * "unstudied", so there's no separate empty/error state to thread through.
 */
export async function getTopicProgress(): Promise<
  Record<string, TopicProgress>
> {
  const user = await getServerUser();
  if (!user) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("topic_progress")
    .select("topic_id, study_count, last_studied_at")
    .eq("user_id", user.id);

  if (error || !data) {
    if (error) {
      console.error(
        "[topic-progress] failed to load topic progress:",
        error.message,
      );
    }
    return {};
  }

  const progress: Record<string, TopicProgress> = {};
  for (const row of data) {
    progress[row.topic_id] = {
      topicId: row.topic_id,
      studyCount: row.study_count,
      lastStudiedAt: row.last_studied_at,
    };
  }
  return progress;
}
