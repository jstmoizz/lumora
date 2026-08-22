import { listConversations } from "@/lib/supabase/conversations";
import HistoryClient from "./HistoryClient";

export default async function HistoryPage() {
  const conversations = await listConversations();
  return <HistoryClient conversations={conversations} />;
}
