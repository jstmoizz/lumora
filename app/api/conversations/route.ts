import { requireUser } from "@/lib/supabase/authorization";
import { listConversations } from "@/lib/supabase/conversations";

// Backs Generate's Recent Chats panel — the client-side counterpart to
// `/history`, which calls `listConversations()` directly from its server
// component instead. This route exists because GenerateWorkspace needs to
// re-fetch the list *after* the initial page load (a new conversation gets
// created, an existing one moves to the top) without a full page navigation.
export async function GET() {
  try {
    await requireUser();
  } catch {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const conversations = await listConversations();
  return Response.json({ conversations });
}
