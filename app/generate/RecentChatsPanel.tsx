"use client";

import { HistoryIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import type { ConversationSummary } from "@/lib/supabase/conversations";

interface RecentChatsPanelProps {
  conversations: ConversationSummary[];
  activeConversationId?: string;
  /** The conversation currently being fetched after a click — disables just
   * that row rather than the whole list, so the rest stays usable. */
  loadingConversationId?: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

// Generate's left panel: a compact conversation switcher, not a full
// history browser (that's still /history — this is "enough to get back to
// something you were just working on," same scope the old Recent Prompts
// panel had, just backed by real conversations instead of a session-only
// prompt-text log). Selecting a row hands its id up to GenerateWorkspace,
// which fetches that conversation's messages and swaps the active session;
// see GenerateWorkspace.tsx for why that's a remount rather than a
// setMessages call.
export default function RecentChatsPanel({
  conversations,
  activeConversationId,
  loadingConversationId,
  onSelect,
  onNewChat,
}: RecentChatsPanelProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Recent Chats
      </h2>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onNewChat}
        className="w-full justify-start gap-1.5"
      >
        <PlusIcon aria-hidden="true" className="size-3.5" />
        New Chat
      </Button>

      {conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <div
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-lg bg-secondary text-foreground"
          >
            <HistoryIcon className="size-4" />
          </div>
          <p className="max-w-[20ch] text-xs text-muted-foreground">
            Your conversations will show up here.
          </p>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  title={conversation.title}
                  aria-current={isActive ? "true" : undefined}
                  disabled={loadingConversationId === conversation.id}
                  onClick={() => onSelect(conversation.id)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors duration-150 ease-out hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                    isActive && "bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "truncate text-sm",
                      isActive
                        ? "font-semibold text-foreground"
                        : "text-foreground",
                    )}
                  >
                    {conversation.title}
                  </span>
                  <span
                    suppressHydrationWarning
                    className="truncate text-[11px] text-muted-foreground"
                  >
                    {formatRelativeTime(conversation.updatedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
