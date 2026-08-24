import { requireUser } from "@/lib/supabase/authorization";
import { getConversationMessages } from "@/lib/supabase/conversations";

// Lets Generate switch to a Recent Chat client-side, instead of navigating
// to /generate?conversationId=... (still used by /history's links).
// `getConversationMessages` returns `null` for both "doesn't exist" and
// "not yours" (RLS makes those indistinguishable), so this can't be used to
// probe another user's conversation ids.
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
