"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcwIcon } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import { resetKnowledgeGraph } from "@/lib/supabase/knowledge-graph-actions";

// A small inline text control, not a primary button — no layout opinion of
// its own, so it sits inline in whatever row the caller places it in.
export default function ResetGraphControl() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // resetKnowledgeGraph never throws, so failure has to be read from its result.
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // Closes the same double-confirm window as ExploreClient's isDeletingRef.
  const isResettingRef = useRef(false);

  function handleConfirm() {
    if (isResettingRef.current) return;
    isResettingRef.current = true;
    startTransition(async () => {
      try {
        const result = await resetKnowledgeGraph();
        if (!result.ok) {
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
      {/* role="alert" announces this immediately and stays visible for sighted users. */}
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </>
  );
}
