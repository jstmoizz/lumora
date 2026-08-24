"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcwIcon } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import { resetKnowledgeGraph } from "@/lib/supabase/knowledge-graph-actions";

// Deliberately quiet — a small inline text control, not a prominent primary
// button. No layout opinion of its own (no wrapping/centering div) so it can
// sit inline in whatever row the caller places it in — currently the
// level/topic-count line at the top of the page.
export default function ResetGraphControl() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Set only when a confirmed reset's Server Action reports failure
  // (`{ ok: false }`) — resetKnowledgeGraph already catches its own
  // Supabase errors rather than throwing, so this can't be caught with a
  // try/catch; it has to be read from the result. Cleared on the next
  // reset attempt.
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // See ExploreClient.tsx's `isDeletingRef` for why `isPending` alone can't
  // close this window — same pattern, same reason, applied to this
  // component's own separate reset mutation.
  const isResettingRef = useRef(false);

  function handleConfirm() {
    if (isResettingRef.current) return;
    isResettingRef.current = true;
    startTransition(async () => {
      try {
        const result = await resetKnowledgeGraph();
        if (!result.ok) {
          // Reset failed server-side — leave the graph untouched instead of
          // refreshing as if it had been cleared. Retry path is just
          // clicking Reset Knowledge Graph again.
          setError("Couldn't reset your knowledge graph. Please try again.");
          return;
        }
        router.refresh();
      } finally {
        isResettingRef.current = false;
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <RotateCcwIcon aria-hidden="true" className="size-3" />
        Reset Knowledge Graph
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Reset Knowledge Graph"
        description="This will remove all studied topics and return your graph to Lumora Core. This can't be undone."
        confirmLabel="Reset Graph"
        onConfirm={handleConfirm}
        confirmDisabled={isPending}
      />
      {/*
        `role="alert"` is an implicit assertive live region — announced to
        screen readers the moment it appears, and (unlike a purely sr-only
        span) visible so sighted users see it too. This component has no
        layout opinion of its own (see the module comment), so this renders
        inline in whatever row the caller places it in, same as the button.
      */}
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </>
  );
}
