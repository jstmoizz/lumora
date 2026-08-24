"use client";

import { useState, useTransition } from "react";
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
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      await resetKnowledgeGraph();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
      />
    </>
  );
}
