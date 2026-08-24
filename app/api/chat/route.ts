import {
  convertToModelMessages,
  isTextUIPart,
  stepCountIs,
  streamText,
} from "ai";
import { chatModel, GENERATION_CONFIG, SYSTEM_PROMPT } from "@/lib/ai/config";
import { smoothTextStream } from "@/lib/ai/smoothTextStream";
import { lumoraTools, type LumoraUIMessage } from "@/lib/ai/tools";
import { requireUser } from "@/lib/supabase/authorization";
import { upsertKnowledgeNodeActivity } from "@/lib/supabase/knowledge-graph";
import { createClient } from "@/lib/supabase/server";

const TITLE_MAX_LENGTH = 60;

// A deterministic title from the first user message — no separate model
// call just to summarize it. Whitespace-normalized and hard-capped so a
// long prompt can never turn into a huge stored title.
function titleFromMessage(message: LumoraUIMessage): string {
  const text = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "New conversation";
  if (text.length <= TITLE_MAX_LENGTH) return text;
  return `${text.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

// The plain-text `content` column is a display/search convenience derived
// from `parts` (which remains the source of truth) — null when a message
// has no text part at all (e.g. a quiz-only assistant turn).
function extractText(message: LumoraUIMessage): string | null {
  const text = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
  return text || null;
}

interface ChatRequestBody {
  messages: LumoraUIMessage[];
  conversationId?: string;
  trigger?: string;
}

export async function POST(req: Request) {
  // Every request must belong to a signed-in user — `/generate` being a
  // protected page is not enough on its own, since this route can be hit
  // directly. Identity comes only from the session Supabase already
  // validated (`getServerUser`, via `requireUser`), never from anything the
  // client sends in the body.
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  // Fail fast with an actionable message instead of letting the request
  // reach Anthropic and fail deep inside streamText, where the client only
  // ever sees the AI SDK's generic "An error occurred." stream error.
  if (!process.env.GROQ_API_KEY) {
    console.error(
      "[api/chat] GROQ_API_KEY is not set. Add it to .env.local at the project root.",
    );
    return Response.json(
      {
        error:
          "Server is not configured: GROQ_API_KEY is missing. Add it to .env.local and restart the dev server.",
      },
      { status: 500 },
    );
  }

  let messages: LumoraUIMessage[];
  let requestedConversationId: string | null;
  let trigger: string | null;

  try {
    const body: unknown = await req.json();
    const { messages: bodyMessages, conversationId, trigger: bodyTrigger } =
      (body ?? {}) as Partial<ChatRequestBody>;
    if (!Array.isArray(bodyMessages)) {
      throw new Error("`messages` must be an array");
    }
    messages = bodyMessages;
    requestedConversationId =
      typeof conversationId === "string" && conversationId ? conversationId : null;
    trigger = typeof bodyTrigger === "string" ? bodyTrigger : null;
  } catch {
    return Response.json(
      { error: "Request body must be JSON with a `messages` array." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  let conversationId: string;

  if (requestedConversationId) {
    // The server client is RLS-scoped to the signed-in user, so a
    // conversation that exists but belongs to someone else simply won't be
    // returned here — the same query doubles as the existence check and
    // the ownership check, and a stranger's conversation ID can't be
    // distinguished from a nonexistent one from the response alone.
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", requestedConversationId)
      .single();

    if (!conversation) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
    conversationId = conversation.id;
  } else {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const title = lastUserMessage ? titleFromMessage(lastUserMessage) : "New conversation";

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ user_id: userId, title })
      .select("id")
      .single();

    if (error || !created) {
      console.error("[api/chat] failed to create conversation:", error?.message);
      return Response.json(
        { error: "Could not start a new conversation." },
        { status: 500 },
      );
    }
    conversationId = created.id;
  }

  // Persist the user's turn as soon as it's accepted, independent of
  // whether the assistant's response below succeeds. Skipped on a retry
  // (`trigger: "regenerate-message"`), since that resends the same
  // already-persisted user message rather than a new one — the AI SDK sets
  // this field itself, not something the client crafts by hand.
  const newUserMessage = messages[messages.length - 1];
  if (trigger !== "regenerate-message" && newUserMessage?.role === "user") {
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: extractText(newUserMessage),
      parts: newUserMessage.parts,
    });
    if (error) {
      console.error("[api/chat] failed to persist user message:", error.message);
      return Response.json({ error: "Could not save your message." }, { status: 500 });
    }
  }

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: chatModel,
    instructions: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: lumoraTools,
    // Default is a single step, which would end the turn right after a
    // tool call with no room for the model to respond to its result. Two
    // steps lets it call `createQuiz`/`createFlashcards` and then comment
    // on the result — SYSTEM_PROMPT instructs it to keep that comment to a
    // short acknowledgment rather than restating the activity it just
    // generated, since the activity itself renders in the Resources panel.
    stopWhen: stepCountIs(2),
    // Groq's inference is fast enough that, without this, a whole response
    // can arrive across only one or two real network chunks — technically
    // "streamed" but visually indistinguishable from the message just
    // appearing all at once. This re-chunks the model's raw output into a
    // steady word-by-word stream on the server, independent of how bursty
    // the underlying provider chunks actually are, so the client always
    // sees a genuine progressive reveal (and its own auto-scroll-while-
    // streaming behavior has something to follow).
    //
    // Deliberately `smoothTextStream` (ours), not the AI SDK's own
    // `smoothStream` — that one paces `reasoning-delta` chunks at the same
    // rate as text, and reasoning models (qwen3.6-27b included) emit a full
    // "thinking" trace before every step. ChatInterface.tsx never renders
    // reasoning parts, so smoothing them only adds wall-clock latency to a
    // stream nobody sees; this variant passes reasoning straight through.
    experimental_transform: smoothTextStream({ chunking: "word", delayInMs: 20 }),
    ...GENERATION_CONFIG,
  });

  return result.toUIMessageStreamResponse<LumoraUIMessage>({
    // Attaches the (new-or-existing) conversation id to the assistant
    // message the instant it starts, so the client can pick it up from
    // `message.metadata` even while the response is still streaming.
    // Metadata set on `start` is merged into anything set on `finish`
    // (never replaced), so this doesn't need repeating below.
    messageMetadata: ({ part }) =>
      part.type === "start" ? { conversationId } : undefined,
    // Runs once the assistant's turn is done — success, error, or abort.
    // (`onEnd`, not the deprecated `onFinish` alias.) Persistence
    // deliberately happens around the existing stream rather than
    // replacing it, so the client keeps seeing tokens the moment they're
    // generated; only once nothing more will change do we write the
    // finished message to the database.
    onEnd: async ({ responseMessage, isAborted, finishReason }) => {
      // No `finish` event ever arrived (the model call itself failed) or
      // the user hit Stop — either way, there's no complete assistant turn
      // to persist. Never write a partial/fake assistant message.
      if (isAborted || finishReason == null) return;

      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: extractText(responseMessage),
        parts: responseMessage.parts,
      });
      if (messageError) {
        console.error(
          "[api/chat] failed to persist assistant message:",
          messageError.message,
        );
        return;
      }

      // Feeds Explore's knowledge graph: every quiz/flashcard set (or direct
      // addKnowledgeTopic call) the model actually made this turn becomes
      // (or updates) a node. Wrapped in try/catch on top of
      // upsertKnowledgeNodeActivity's own internal error handling (belt-and-
      // suspenders) — a failed write here must never affect the chat
      // response already streamed to the client.
      for (const part of responseMessage.parts) {
        try {
          if (part.type === "tool-createQuiz" && part.state === "output-available") {
            await upsertKnowledgeNodeActivity(supabase, userId, {
              label: part.output.topic,
              kind: "quiz",
              relatedTopics: part.output.relatedTopics,
              category: part.output.category,
            });
          } else if (
            part.type === "tool-createFlashcards" &&
            part.state === "output-available"
          ) {
            await upsertKnowledgeNodeActivity(supabase, userId, {
              label: part.output.topic,
              kind: "flashcards",
              relatedTopics: part.output.relatedTopics,
              category: part.output.category,
            });
          } else if (
            part.type === "tool-addKnowledgeTopic" &&
            part.state === "output-available"
          ) {
            await upsertKnowledgeNodeActivity(supabase, userId, {
              label: part.output.topic,
              kind: "manual",
              relatedTopics: part.output.relatedTopics,
              category: part.output.category,
              summary: part.output.summary,
            });
          }
        } catch (knowledgeGraphError) {
          console.error(
            "[api/chat] failed to update knowledge graph:",
            knowledgeGraphError,
          );
        }
      }

      const { error: updateError } = await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      if (updateError) {
        console.error(
          "[api/chat] failed to update conversation timestamp:",
          updateError.message,
        );
      }
    },
    onError(error) {
      // Logged server-side only, for local diagnosis. The AI SDK already
      // keeps the client-facing message generic by default; we keep that
      // behavior explicit here rather than forwarding `error` to the client.
      console.error("[api/chat] streamText error:", error);
      return "Something went wrong while generating a response. Please try again.";
    },
  });
}
