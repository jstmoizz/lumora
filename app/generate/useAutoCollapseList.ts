import { useEffect, useRef, useState } from "react";

// Backs the "newest card opens, everything else stays as the user left it"
// behavior shared by QuizPanel and FlashcardsPanel: whenever the newest
// item's id changes (a quiz/flashcard set was just generated), that item
// opens and whichever item THIS hook itself opened last time collapses
// back — never anything the user manually opened or closed themselves.
//
// A plain per-item `defaultOpen` can't do this: it only applies once, at
// that item's own mount, so it can't retroactively collapse a card that
// was already open when a *newer* sibling arrives — generating several
// quizzes in a row would otherwise leave every one of them open at once,
// exactly the "wall of always-visible cards" this exists to prevent.
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
