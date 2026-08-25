"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { LayersIcon, MessageCircleIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageExtraction } from "@/lib/ai/extraction";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The review card shown after Qwen extracts study content from an attached
 * image (app/api/chat/route.ts's `data-extraction` part). This is the only
 * thing the user sees for that turn — the extraction never generates a quiz
 * or flashcards on its own; the three actions below are how the user
 * explicitly decides what happens next.
 */
export function ExtractionCard({
  extraction,
  disabled = false,
  onCreateQuiz,
  onCreateFlashcards,
  onAskAboutThis,
}: {
  extraction: ImageExtraction;
  disabled?: boolean;
  onCreateQuiz: () => void;
  onCreateFlashcards: () => void;
  onAskAboutThis: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !wrapperRef.current) return;
      gsap.from(wrapperRef.current, {
        opacity: 0,
        y: 10,
        duration: 0.35,
        ease: "power2.out",
        clearProps: "all",
      });
    },
    { scope: wrapperRef, dependencies: [] },
  );

  return (
    <div
      ref={wrapperRef}
      className="flex w-full max-w-lg min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--generate-accent-soft)] text-[var(--generate-accent-solid)]">
          <SparklesIcon aria-hidden="true" className="size-4" />
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="text-sm font-semibold text-foreground">
            I found this in your image
          </p>
          {extraction.title && (
            <p className="truncate text-xs text-muted-foreground">{extraction.title}</p>
          )}
        </div>
      </div>

      <p className="text-sm leading-relaxed break-words text-foreground">
        {extraction.summary}
      </p>

      {extraction.extractedContent && (
        <div className="max-h-48 overflow-y-auto rounded-lg bg-secondary/60 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
          {extraction.extractedContent}
        </div>
      )}

      {extraction.keyConcepts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {extraction.keyConcepts.map((concept) => (
            <span
              key={concept}
              className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
            >
              {concept}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={onCreateQuiz}
          className="gap-1.5 rounded-xl bg-[var(--generate-accent-solid)] text-[var(--generate-accent-foreground)] transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-[var(--generate-accent-solid)] hover:opacity-90 disabled:hover:translate-y-0 disabled:hover:scale-100"
        >
          <SparklesIcon aria-hidden="true" className="size-3.5" />
          Create Quiz
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onCreateFlashcards}
          className="gap-1.5 rounded-xl transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03] disabled:hover:translate-y-0 disabled:hover:scale-100"
        >
          <LayersIcon aria-hidden="true" className="size-3.5" />
          Create Flashcards
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onAskAboutThis}
          className="gap-1.5 rounded-xl text-muted-foreground"
        >
          <MessageCircleIcon aria-hidden="true" className="size-3.5" />
          Ask about this
        </Button>
      </div>
    </div>
  );
}
