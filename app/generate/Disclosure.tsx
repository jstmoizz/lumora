"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DisclosureProps {
  label: ReactNode;
  meta?: ReactNode;
  /** Uncontrolled initial state — ignored once `open` is provided. */
  defaultOpen?: boolean;
  /** Controlled expanded state. Omit for a plain uncontrolled disclosure
   * (the playground demo's usage); pass alongside `onOpenChange` when a
   * parent needs to drive it — see QuizPanel.tsx, which auto-manages which
   * quiz card is open across a growing list. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

// The W3C APG Disclosure pattern (https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
// — the same pattern already demonstrated in
// app/playground/disclosure/Disclosure.tsx — reimplemented here against
// this app's own design tokens (border/card/accent/ring, matching
// QuizPanel's existing option-button styling) instead of that playground
// demo's fixed zinc colors and `max-w-md`, plus the `defaultOpen`/`meta`
// (a secondary muted line under the label) this usage needs that the demo
// didn't. A plain `<button>` + `aria-expanded`/`aria-controls` gives this
// native keyboard support (Enter/Space, Tab order) for free — no listbox/
// roving-tabindex machinery needed for a single toggle per card.
//
// Collapsed content stays mounted, hidden via the native `hidden` attribute
// rather than being removed from the tree — deliberately different from
// the playground demo this is based on. This backs a *list* of these (one
// per generated quiz/flashcard set), and each one owns real interaction
// state (which question a quiz is on, what's been answered, which
// flashcard is showing and which side is up) that must survive being
// collapsed and reopened — unmounting on collapse would silently reset all
// of that the moment a card closed. `hidden` still removes the content
// from the accessibility tree and from tab order, so this costs nothing
// for assistive tech; it only keeps the (usually small) React/DOM subtree
// alive underneath.
export default function Disclosure({
  label,
  meta,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
  className,
}: DisclosureProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isExpanded = isControlled ? controlledOpen : uncontrolledOpen;
  const contentId = useId();

  function toggle() {
    const next = !isExpanded;
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setUncontrolledOpen(next);
    }
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-[var(--generate-accent-soft)] focus-visible:bg-[var(--generate-accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--generate-accent-ring)] focus-visible:outline-none"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {label}
          </span>
          {meta && (
            <span className="truncate text-xs text-muted-foreground">
              {meta}
            </span>
          )}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none",
            isExpanded && "rotate-180",
          )}
        />
      </button>
      <div
        id={contentId}
        hidden={!isExpanded}
        className="border-t border-border px-3 py-3"
      >
        {children}
      </div>
    </div>
  );
}
