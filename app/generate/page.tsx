import { getConversationMessages } from "@/lib/supabase/conversations";
import GenerateWorkspace from "./GenerateWorkspace";

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const { conversationId } = await searchParams;

  // A conversationId that doesn't exist or isn't this user's own (RLS
  // makes those indistinguishable) is treated exactly like none was
  // given — silently falls back to a fresh conversation rather than
  // surfacing an error for what could just be a stale/tampered link.
  const messages = conversationId
    ? await getConversationMessages(conversationId)
    : null;
  const resolvedConversationId = messages ? conversationId : undefined;

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-6 pb-24 sm:px-6">
      {/*
        No page headline here (previously "Study with Lumora") — redundant
        with Home's own hero, and the workspace (Recent Prompts / Chat /
        Quiz) benefits more from the vertical room than the heading did.
        The page still has an accessible name via <title> (see metadata in
        the root layout) and the Dock's own "Generate" label.
      */}
      {/*
        Keyed by conversation so navigating History -> a different past
        conversation (or History -> a brand new chat) fully remounts the
        whole workspace (including ChatInterface's useChat state, and the
        Recent Prompts/Quiz panel state alongside it) instead of reusing
        state from whatever was open before.
      */}
      <GenerateWorkspace
        key={resolvedConversationId ?? "new"}
        initialConversationId={resolvedConversationId}
        initialMessages={messages ?? undefined}
      />
    </main>
  );
}
