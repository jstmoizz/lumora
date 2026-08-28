"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CreateQuizOutput, CreateQuizQuestion } from "@/lib/ai/tools";
import Disclosure from "./Disclosure";
import { useAutoCollapseList } from "./useAutoCollapseList";

interface QuizPanelProps {
  quizzes: CreateQuizOutput[];
  /** See ActiveQuiz's own comment — fired once per quiz, the first time it's
   * finished with at least one wrong or unanswered question. */
  onExplainMistakes?: (text: string) => void;
}

// The only place the interactive quiz (navigation, answers, scoring)
// renders — the in-chat tool-call UI only shows a non-interactive status
// (see PracticeToolPart.tsx). Each quiz gets its own Disclosure row; only
// the most recent starts expanded (see useAutoCollapseList.ts).
export default function QuizPanel({ quizzes, onExplainMistakes }: QuizPanelProps) {
  const { isOpen, setOpen } = useAutoCollapseList(quizzes[0]?.quizId);

  return (
    <div className="flex h-full flex-col gap-2">
      {quizzes.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <div
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-lg bg-secondary text-foreground"
          >
            <SparklesIcon className="size-4" />
          </div>
          <p className="text-sm font-medium text-foreground">No quiz yet</p>
          <p className="max-w-[22ch] text-xs text-muted-foreground">
            Ask Lumora to quiz you on a topic and it&apos;ll show up here.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {quizzes.map((quiz) => (
            <Disclosure
              key={quiz.quizId}
              open={isOpen(quiz.quizId)}
              onOpenChange={(open) => setOpen(quiz.quizId, open)}
              label={quiz.topic}
              meta={`${quiz.questions.length} question${quiz.questions.length === 1 ? "" : "s"}`}
            >
              <ActiveQuiz quiz={quiz} onExplainMistakes={onExplainMistakes} />
            </Disclosure>
          ))}
        </div>
      )}
    </div>
  );
}

// Kept short, like ChatInterface's own extractionActionText — the full quiz
// (every question, option, and correct answer) is already in this
// conversation's history as the createQuiz tool's output, so the AI doesn't
// need it repeated here, just which questions were missed and what was
// picked instead.
function buildMistakesMessage(
  quiz: CreateQuizOutput,
  missed: CreateQuizQuestion[],
  selections: Record<string, number>,
): string {
  const lines = missed.map((question, i) => {
    const picked = selections[question.id];
    const pickedText =
      picked === undefined
        ? "I left this unanswered"
        : `I answered "${question.options[picked]}"`;
    return `${i + 1}. "${question.question}" — ${pickedText}.`;
  });

  return [
    `I just finished the quiz on ${quiz.topic} and got ${missed.length} of ${quiz.questions.length} wrong:`,
    ...lines,
    "",
    "Can you explain what I got wrong on these and help me understand them better?",
  ].join("\n");
}

// Live generation can't produce a zero-question quiz (the schema requires
// at least one), but a persisted quiz loads straight from the database
// with no re-validation, so this has to be handled defensively.
function EmptyQuizFallback() {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <CircleAlertIcon aria-hidden="true" className="size-4" />
      </div>
      <div className="flex flex-col">
        <p className="text-sm font-medium text-foreground">
          This quiz couldn&apos;t be loaded.
        </p>
        <p className="text-xs text-muted-foreground">
          Try generating the quiz again.
        </p>
      </div>
    </div>
  );
}

function ActiveQuiz({
  quiz,
  onExplainMistakes,
}: {
  quiz: CreateQuizOutput;
  onExplainMistakes?: (text: string) => void;
}) {
  const [index, setIndex] = useState(0);
  // Selected option per question, keyed by question id. Local-only — no
  // persistence, no backend scoring.
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);
  // Guards against sending a second time if the user reviews answers and
  // hits Finish again on the same quiz.
  const hasSentExplanationRef = useRef(false);

  // The first time this quiz is finished with at least one wrong or
  // unanswered question, push a summary into the chat so the AI explains
  // the mistakes as the next turn — see buildMistakesMessage above.
  useEffect(() => {
    if (!finished || hasSentExplanationRef.current) return;
    const missed = quiz.questions.filter(
      (question) => selections[question.id] !== question.correctIndex,
    );
    if (missed.length === 0) return;
    hasSentExplanationRef.current = true;
    onExplainMistakes?.(buildMistakesMessage(quiz, missed, selections));
  }, [finished, quiz, selections, onExplainMistakes]);

  const total = quiz.questions.length;

  // Guards every access below `quiz.questions[index]` at once — with zero
  // questions there's no valid index at all (0 is already out of bounds).
  if (total === 0) {
    return <EmptyQuizFallback />;
  }

  const question = quiz.questions[index];
  const selected = selections[question.id];
  const hasAnswered = selected !== undefined;
  const answeredCorrectly = selected === question.correctIndex;
  const isLastQuestion = index === total - 1;

  const correctCount = quiz.questions.filter(
    (q) => selections[q.id] === q.correctIndex,
  ).length;
  const answeredCount = Object.keys(selections).length;

  function selectOption(optionIndex: number) {
    setSelections((prev) => ({ ...prev, [question.id]: optionIndex }));
  }

  function goToPrevious() {
    setIndex((current) => Math.max(0, current - 1));
  }

  function goToNext() {
    if (isLastQuestion) {
      setFinished(true);
      return;
    }
    setIndex((current) => Math.min(total - 1, current + 1));
  }

  if (finished) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full bg-secondary text-foreground"
        >
          <CheckCircle2Icon className="size-5" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">
            Quiz complete
          </p>
          <p className="text-xs text-muted-foreground">
            {correctCount} / {total} correct
            {answeredCount < total
              ? ` — ${total - answeredCount} unanswered`
              : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setIndex(0);
            setFinished(false);
          }}
        >
          Review answers
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {quiz.topic}
        </p>
        <p className="shrink-0 text-xs font-medium text-muted-foreground">
          {index + 1} / {total}
        </p>
      </div>

      <div
        aria-hidden="true"
        className="h-1 w-full overflow-hidden rounded-full bg-[var(--generate-accent-soft)]"
      >
        <div
          className="h-full rounded-full bg-[var(--generate-accent-solid)] transition-[width] duration-300 ease-out"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      <p className="min-w-0 text-sm font-medium break-words text-foreground">
        {question.question}
      </p>

      <div
        role="group"
        aria-label={`Answer choices for question ${index + 1}`}
        className="flex flex-col gap-2"
      >
        {question.options.map((option, optionIndex) => {
          const isCorrectOption = optionIndex === question.correctIndex;
          const isSelectedOption = selected === optionIndex;

          return (
            <Button
              key={optionIndex}
              type="button"
              variant="outline"
              size="sm"
              disabled={hasAnswered}
              aria-pressed={isSelectedOption}
              onClick={() => selectOption(optionIndex)}
              className={cn(
                "h-auto min-w-0 justify-start rounded-xl px-3 py-2 text-left text-sm font-normal whitespace-normal break-words focus-visible:ring-[var(--generate-accent-ring)] disabled:opacity-100",
                hasAnswered &&
                  isCorrectOption &&
                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400",
                hasAnswered &&
                  isSelectedOption &&
                  !isCorrectOption &&
                  "border-red-500/40 bg-red-500/10 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400",
              )}
            >
              {option}
            </Button>
          );
        })}
      </div>

      {hasAnswered && (
        <p
          role="status"
          className={cn(
            "text-xs",
            answeredCorrectly
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400",
          )}
        >
          {answeredCorrectly
            ? "Correct!"
            : `Not quite — the correct answer is "${question.options[question.correctIndex]}."`}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={goToPrevious}
          disabled={index === 0}
          aria-label="Previous question"
          className="gap-1"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={goToNext}
          aria-label={isLastQuestion ? "Finish quiz" : "Next question"}
          className="gap-1 bg-[var(--generate-accent-solid)] text-[var(--generate-accent-foreground)] hover:bg-[var(--generate-accent-solid)] hover:opacity-90"
        >
          {isLastQuestion ? "Finish" : "Next"}
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}
