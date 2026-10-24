// Pure quiz-attempt logic shared by the Server Actions in
// lib/supabase/quiz-attempt-actions.ts and Generate's QuizPanel — kept out
// of the "use server" file (which may only export async functions) so it
// can be imported client-side and unit tested on its own.

export type QuizAttemptMode = "full" | "missed";

/** What QuizPanel reports when an attempt is finished. */
export interface QuizAttemptInput {
  conversationId?: string;
  quizId: string;
  topic: string;
  mode: QuizAttemptMode;
  correctCount: number;
  totalCount: number;
  missedQuestionIds: string[];
}

/** Per-quiz rollup shown in the Resources panel. */
export interface QuizAttemptSummary {
  attempts: number;
  /** Best whole-quiz score — `null` if only "missed" retakes exist. */
  bestFull: { correct: number; total: number } | null;
}

export type QuizAttemptSummaries = Record<string, QuizAttemptSummary>;

// The createQuiz tool writes 1-5 questions; generous headroom here so a
// future change there doesn't silently start failing to save.
const MAX_QUESTIONS = 50;
const MAX_ID_LENGTH = 200;
const MAX_TOPIC_LENGTH = 200;

/**
 * Runtime check of a client-supplied attempt — a Server Action is a
 * network-callable endpoint, so TypeScript's types alone prove nothing.
 * Returns the cleaned input, or `null` if anything is off.
 */
export function parseQuizAttemptInput(input: unknown): QuizAttemptInput | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;

  const { conversationId, quizId, topic, mode, correctCount, totalCount, missedQuestionIds } =
    value;

  if (conversationId !== undefined && conversationId !== null) {
    if (typeof conversationId !== "string" || !conversationId || conversationId.length > MAX_ID_LENGTH) {
      return null;
    }
  }
  if (typeof quizId !== "string" || !quizId || quizId.length > MAX_ID_LENGTH) return null;
  if (typeof topic !== "string") return null;
  const trimmedTopic = topic.trim().slice(0, MAX_TOPIC_LENGTH);
  if (!trimmedTopic) return null;
  if (mode !== "full" && mode !== "missed") return null;
  if (!Number.isInteger(totalCount) || (totalCount as number) < 1 || (totalCount as number) > MAX_QUESTIONS) {
    return null;
  }
  if (
    !Number.isInteger(correctCount) ||
    (correctCount as number) < 0 ||
    (correctCount as number) > (totalCount as number)
  ) {
    return null;
  }
  if (
    !Array.isArray(missedQuestionIds) ||
    missedQuestionIds.length !== (totalCount as number) - (correctCount as number) ||
    !missedQuestionIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH)
  ) {
    return null;
  }

  return {
    conversationId: (conversationId as string | null | undefined) ?? undefined,
    quizId,
    topic: trimmedTopic,
    mode,
    correctCount: correctCount as number,
    totalCount: totalCount as number,
    missedQuestionIds: missedQuestionIds as string[],
  };
}

interface AttemptRow {
  quiz_id: string;
  mode: QuizAttemptMode;
  correct_count: number;
  total_count: number;
}

type Score = { correct: number; total: number };

// Compared as a ratio, not a raw count, in case a quiz's question count
// ever differs between attempts.
function isBetter(score: Score, best: Score | null): boolean {
  return !best || score.correct / score.total > best.correct / best.total;
}

/** Applies one attempt to a summary map, returning a new map. */
export function addAttemptToSummaries(
  summaries: QuizAttemptSummaries,
  attempt: Pick<QuizAttemptInput, "quizId" | "mode" | "correctCount" | "totalCount">,
): QuizAttemptSummaries {
  const existing = summaries[attempt.quizId] ?? { attempts: 0, bestFull: null };
  const score = { correct: attempt.correctCount, total: attempt.totalCount };
  const bestFull =
    attempt.mode === "full" && isBetter(score, existing.bestFull) ? score : existing.bestFull;
  return {
    ...summaries,
    [attempt.quizId]: { attempts: existing.attempts + 1, bestFull },
  };
}

/** Folds raw attempt rows into one summary per quiz. */
export function summarizeQuizAttempts(rows: AttemptRow[]): QuizAttemptSummaries {
  return rows.reduce<QuizAttemptSummaries>(
    (summaries, row) =>
      addAttemptToSummaries(summaries, {
        quizId: row.quiz_id,
        mode: row.mode,
        correctCount: row.correct_count,
        totalCount: row.total_count,
      }),
    {},
  );
}
