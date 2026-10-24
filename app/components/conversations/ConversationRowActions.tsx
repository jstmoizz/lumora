"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConversationRowActionsProps {
  /** id of the element holding the conversation's title — the buttons'
   * accessible description, so "Rename conversation" is never ambiguous. */
  titleId: string;
  onRename: () => void;
  onDelete: () => void;
  disabled?: boolean;
  className?: string;
}

// Rename/delete icon buttons for one conversation row. Their accessible
// names stay generic ("Rename conversation") and the title rides along as
// the description, rather than baking the title into the name — a row's
// own title-named button stays the only match for its title.
//
// Hidden until the row is hovered or focused on pointer devices; always
// visible on touch, where there's no hover to reveal them.
export default function ConversationRowActions({
  titleId,
  onRename,
  onDelete,
  disabled = false,
  className,
}: ConversationRowActionsProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label="Rename conversation"
        aria-describedby={titleId}
        onClick={onRename}
        className="size-7 text-muted-foreground hover:text-foreground"
      >
        <PencilIcon aria-hidden="true" className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label="Delete conversation"
        aria-describedby={titleId}
        onClick={onDelete}
        className="size-7 text-muted-foreground hover:text-destructive"
      >
        <Trash2Icon aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );
}
