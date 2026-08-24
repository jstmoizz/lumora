"use client";

import { useState } from "react";
import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CreateQuizOutput } from "@/lib/ai/tools";
import Disclosure from "./Disclosure";
import { useAutoCollapseList } from "./useAutoCollapseList";

interface QuizPanelProps {
  quizzes: CreateQuizOutput[];
}

// The Quizzes half of Practice — the *only* place the interactive quiz
// (navigation, answers, scoring) renders. The in-chat tool-call UI only
// shows a non-interactive status (see PracticeToolPart.tsx), so the quiz
// itself is never duplicated.
//
// Every generated quiz gets its own row, each its own Disclosure — only
// the most recent starts expanded, everything older starts collapsed but
// stays reachable. See useAutoCollapseList.ts (shared with FlashcardsPanel).
export default function QuizPanel({ quizzes }: QuizPanelProps) {
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
              <ActiveQuiz quiz={quiz} />
            </Disclosure>
          ))}
        </div>
      )}
    </div>
  );
}

// Live generation can't produce a zero-question quiz (the schema requires
// at least one), but one resumed from a persisted conversation loads
// straight from the database with no re-validation, so this has to be
// handled defensively. Same visual language as PracticeToolPart's
// ActivityErrorCard, scaled for a Disclosure row.
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

function ActiveQuiz({ quiz }: { quiz: CreateQuizOutput }) {
  const [index, setIndex] = useState(0);
  // Which option the student picked per question, keyed by question id.
  // Local-only: no persistence, no backend scoring — answering just
  // reveals correct/incorrect for that question and locks it in. Same
  // mechanic as the quiz's original in-chat rendering, just paginated.
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);

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
