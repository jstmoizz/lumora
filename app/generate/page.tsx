import { getConversationMessages } from "@/lib/supabase/conversations";
import ChatInterface from "./ChatInterface";

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
    <main className="flex min-h-0 flex-1 flex-col items-center gap-3 px-4 py-6 sm:px-6">
      <h1 className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        Study with Lumora
      </h1>
      {/*
        Keyed by conversation so navigating History -> a different past
        conversation (or History -> a brand new chat) fully remounts
        ChatInterface instead of reusing useChat's in-memory state from
        whatever was open before.
      */}
      <ChatInterface
        key={resolvedConversationId ?? "new"}
        initialConversationId={resolvedConversationId}
        initialMessages={messages ?? undefined}
      />
    </main>
  );
}
