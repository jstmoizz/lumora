import {
  getConversationMessages,
  listConversations,
} from "@/lib/supabase/conversations";
import GenerateWorkspace from "./GenerateWorkspace";

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string; topic?: string }>;
}) {
  const { conversationId, topic } = await searchParams;

  // A conversationId that doesn't exist or isn't this user's own (RLS
  // makes those indistinguishable) is treated exactly like none was
  // given — silently falls back to a fresh conversation rather than
  // surfacing an error for what could just be a stale/tampered link.
  const [messages, conversations] = await Promise.all([
    conversationId ? getConversationMessages(conversationId) : Promise.resolve(null),
    listConversations(),
  ]);
  const resolvedConversationId = messages ? conversationId : undefined;

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-6 pb-24 sm:px-6">
      {/*
        No page headline here (previously "Study with Lumora") — redundant
        with Home's own hero, and the workspace (Recent Chats / Chat /
        Resources) benefits more from the vertical room than the heading
        did. The page still has an accessible name via <title> (see
        metadata in the root layout) and the Dock's own "Generate" label.
      */}
      {/*
        Deliberately NOT keyed by conversation here anymore — GenerateWorkspace
        now switches conversations itself (New Chat, selecting a Recent
        Chat) via its own internal remount key, and keeps the URL in sync
        via router.replace as that happens. Keying this from searchParams
        would fight that: our own `router.replace` calls would re-trigger
        this server component and force an unwanted remount, discarding
        the very state we just navigated to preserve. `?conversationId=`
        in the URL now only matters for the *first* load of this page
        (a direct link/refresh) — see GenerateWorkspace's mount effect for
        how it picks a conversation back up when the URL doesn't have one
        (e.g. returning from Explore/Settings via the Dock).
      */}
      <GenerateWorkspace
        initialConversationId={resolvedConversationId}
        initialMessages={messages ?? undefined}
        initialConversations={conversations}
        initialTopic={topic}
      />
    </main>
  );
}
