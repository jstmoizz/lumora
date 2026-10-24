"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CONVERSATION_TITLE_MAX_LENGTH,
  validateConversationTitle,
} from "@/lib/conversationTitle";

interface RenameConversationFormProps {
  initialTitle: string;
  /** Resolves to an error message to show, or `null` once saved. */
  onSave: (title: string) => Promise<string | null>;
  onCancel: () => void;
  className?: string;
}

// Inline rename used by both History and Generate's Recent Chats. Enter
// saves, Escape cancels — the same contract as most inline-edit fields.
// Validation mirrors the Server Action's (lib/conversationTitle.ts), so an
// obviously-bad title never makes the round trip.
export default function RenameConversationForm({
  initialTitle,
  onSave,
  onCancel,
  className,
}: RenameConversationFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const invalid = validateConversationTitle(title);
    if (invalid) {
      setError(invalid);
      return;
    }

    setPending(true);
    setError(null);
    const saveError = await onSave(title);
    // On success the parent unmounts this form, so only a failure needs
    // local state cleaned up.
    if (saveError) {
      setError(saveError);
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}
    >
      <Input
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        maxLength={CONVERSATION_TITLE_MAX_LENGTH}
        disabled={pending}
        aria-label="Conversation title"
        aria-invalid={error ? true : undefined}
        className="h-8 min-w-0 rounded-lg px-2.5 py-1 text-sm"
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <Button type="submit" size="sm" disabled={pending} className="h-7 px-2.5 text-xs">
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onCancel}
          className="h-7 px-2.5 text-xs"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
