import { useEffect, useRef, useState } from "react";

// Backs "newest card opens, everything else stays as the user left it,"
// shared by QuizPanel and FlashcardsPanel: whenever the newest item's id
// changes, it opens and whichever item this hook auto-opened last time
// collapses — never anything the user manually toggled.
//
// A plain per-item `defaultOpen` can't do this — it only applies once, at
// mount, so it can't retroactively collapse a card when a newer sibling
// arrives.
export function useAutoCollapseList(newestId: string | null | undefined) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const lastAutoOpenedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!newestId || newestId === lastAutoOpenedIdRef.current) return;

    setOpenIds((prev) => {
      const next = new Set(prev);
      if (lastAutoOpenedIdRef.current) next.delete(lastAutoOpenedIdRef.current);
      next.add(newestId);
      return next;
    });
    lastAutoOpenedIdRef.current = newestId;
  }, [newestId]);

  return {
    isOpen: (id: string) => openIds.has(id),
    setOpen: (id: string, open: boolean) => {
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (open) next.add(id);
        else next.delete(id);
        return next;
      });
    },
  };
}
