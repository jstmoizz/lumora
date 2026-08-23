"use client";

import { useState } from "react";
import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CreateQuizOutput } from "@/lib/ai/tools";

interface QuizPanelProps {
  quiz: CreateQuizOutput | null;
}

// Lumora's dedicated Quiz experience — the *only* place the interactive
// quiz (question navigation, answer selection, scoring) renders. See
// QuizToolPart.tsx for why: the in-chat tool-call UI only ever shows a
// non-interactive status/notice, specifically so the quiz itself isn't
// duplicated between the conversation and this panel.
export default function QuizPanel({ quiz }: QuizPanelProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Quiz
      </h2>

      {quiz ? (
        // Remounts (resetting question index/selections/completion)
        // whenever a *different* quiz arrives, keyed by its own quizId — a
        // fresh `useState` per quiz is simpler and less error-prone here
        // than manually resetting three pieces of state in an effect.
        <ActiveQuiz key={quiz.quizId} quiz={quiz} />
      ) : (
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
      )}
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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-1">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {quiz.topic}
        </p>
        <p className="shrink-0 text-xs font-medium text-muted-foreground">
          {index + 1} / {total}
        </p>
      </div>

      <p className="text-sm font-medium text-foreground">
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
                "h-auto justify-start rounded-xl px-3 py-2 text-left text-sm font-normal whitespace-normal disabled:opacity-100",
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

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
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
          className="gap-1"
        >
          {isLastQuestion ? "Finish" : "Next"}
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}
