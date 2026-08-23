import { requireUser } from "@/lib/supabase/authorization";
import { getConversationMessages } from "@/lib/supabase/conversations";

// Lets Generate switch to a Recent Chat in place, client-side, instead of
// navigating to /generate?conversationId=... (which `/history`'s links
// still do, and still works — this is an additional entry point, not a
// replacement). `getConversationMessages` already returns `null` for both
// "doesn't exist" and "not yours" (RLS makes those indistinguishable), so
// this route can't be used to probe another user's conversation ids.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  const messages = await getConversationMessages(id);
  if (messages === null) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  return Response.json({ messages });
}
