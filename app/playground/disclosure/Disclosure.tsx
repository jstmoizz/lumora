"use client";

import { useId, useState } from "react";

type DisclosureProps = {
  label: string;
  children: React.ReactNode;
};

export default function Disclosure({ label, children }: DisclosureProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();

  return (
    <div className="w-full max-w-md">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-300 px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
      >
        {label}
        <span aria-hidden="true">{isExpanded ? "−" : "+"}</span>
      </button>
      {isExpanded && (
        <div
          id={contentId}
          className="border border-t-0 border-zinc-300 px-4 py-3 text-left text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
        >
          {children}
        </div>
      )}
    </div>
  );
}
