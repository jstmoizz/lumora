"use server";

/**
 * Saves and reads quiz attempts from Generate's Resources panel.
 *
 * Identity always comes from `getServerUser()`, never an argument, and the
 * attempt itself is re-validated at runtime (see parseQuizAttemptInput).
 * Both functions fail soft — a score that couldn't be saved or loaded must
 * never get in the way of taking the quiz itself, including before the
 * `quiz_attempts` table exists in a given database.
 */

import {
  parseQuizAttemptInput,
  summarizeQuizAttempts,
  type QuizAttemptSummaries,
} from "@/lib/quizAttempts";
import { createClient, getServerUser } from "./server";

export interface SaveQuizAttemptResult {
  ok: boolean;
}

export async function saveQuizAttempt(input: unknown): Promise<SaveQuizAttemptResult> {
  const attempt = parseQuizAttemptInput(input);
  if (!attempt) return { ok: false };

  const user = await getServerUser();
  if (!user) return { ok: false };

  const supabase = await createClient();
  // RLS's insert policy is the real check that conversation_id belongs to
  // the caller — this only supplies the caller's own user_id.
  const { error } = await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    conversation_id: attempt.conversationId ?? null,
    quiz_id: attempt.quizId,
    topic: attempt.topic,
    mode: attempt.mode,
    correct_count: attempt.correctCount,
    total_count: attempt.totalCount,
    missed_question_ids: attempt.missedQuestionIds,
  });

  if (error) {
    console.error("[quiz-attempts] failed to save attempt:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/** Every quiz in one conversation, summarized — `{}` on no user or any failure. */
export async function getQuizAttemptSummaries(
  conversationId: string,
): Promise<QuizAttemptSummaries> {
  if (typeof conversationId !== "string" || !conversationId) return {};

  const user = await getServerUser();
  if (!user) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("quiz_id, mode, correct_count, total_count")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[quiz-attempts] failed to load attempts:", error.message);
    return {};
  }
  return summarizeQuizAttempts(data ?? []);
}
