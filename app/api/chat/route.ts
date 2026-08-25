import {
  convertToModelMessages,
  isTextUIPart,
  stepCountIs,
  streamText,
} from "ai";
import { GENERATION_CONFIG, SYSTEM_PROMPT, resolveModel, visionModel } from "@/lib/ai/config";
import {
  CHAT_MODES,
  DEFAULT_CHAT_MODE,
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_MEDIA_TYPES,
  type ChatMode,
} from "@/lib/ai/model";
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

// Guards each message element (the array itself is already checked) before
// title/extraction or convertToModelMessages() run `.parts.filter(...)` on
// it — a null entry or missing `parts` would otherwise throw deep inside
// those, past the try/catch around model-message conversion.
function hasValidMessageShape(message: unknown): message is LumoraUIMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    Array.isArray((message as { parts?: unknown }).parts)
  );
}

function parseMode(value: unknown): ChatMode {
  return typeof value === "string" && value in CHAT_MODES ? (value as ChatMode) : DEFAULT_CHAT_MODE;
}

type FilePart = Extract<LumoraUIMessage["parts"][number], { type: "file" }>;

function isFilePart(part: LumoraUIMessage["parts"][number]): part is FilePart {
  return part.type === "file";
}

// Only ever strips attachment parts — text/tool/reasoning parts pass through
// untouched. Used both to keep image bytes out of Supabase ("no permanent
// image storage") and to keep image content out of model calls that aren't
// routed to the vision model.
function withoutImageParts(parts: LumoraUIMessage["parts"]): LumoraUIMessage["parts"] {
  return parts.filter((part) => !isFilePart(part));
}

const ALLOWED_IMAGE_SUBTYPES = ALLOWED_IMAGE_MEDIA_TYPES.map((type) => type.split("/")[1]).join("|");
const IMAGE_DATA_URL_PATTERN = new RegExp(
  `^data:image/(?:${ALLOWED_IMAGE_SUBTYPES});base64,([A-Za-z0-9+/]+=*)$`,
);

// Re-derives byte size from the actual transmitted base64 payload rather
// than trusting anything the client claims about the file — this is the
// server-side backstop behind the composer's own client-side check.
function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// Validates the newest message's image attachment(s), if any, against the
// app's attachment policy (lib/ai/model.ts). A non-data-URL `url` (e.g. a
// remote URL smuggled in as a "file" part) is rejected by the same pattern
// that checks the allowed media types, since it can't match either way.
function validateImageParts(
  parts: LumoraUIMessage["parts"],
): { ok: true; hasImage: boolean } | { ok: false; error: string } {
  const fileParts = parts.filter(isFilePart);
  if (fileParts.length === 0) return { ok: true, hasImage: false };
  if (fileParts.length > MAX_IMAGES_PER_MESSAGE) {
    return { ok: false, error: "Only one image is allowed per message." };
  }

  const match = IMAGE_DATA_URL_PATTERN.exec(fileParts[0].url);
  if (!match) {
    return { ok: false, error: "Images must be JPEG, PNG, or WebP." };
  }
  if (estimateBase64Bytes(match[1]) > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image must be 3MB or smaller." };
  }
  return { ok: true, hasImage: true };
}

interface ChatRequestBody {
  messages: LumoraUIMessage[];
  conversationId?: string;
  trigger?: string;
  mode?: string;
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
  let mode: ChatMode;

  try {
    const body: unknown = await req.json();
    const { messages: bodyMessages, conversationId, trigger: bodyTrigger, mode: bodyMode } =
      (body ?? {}) as Partial<ChatRequestBody>;
    if (!Array.isArray(bodyMessages)) {
      throw new Error("`messages` must be an array");
    }
    messages = bodyMessages;
    requestedConversationId =
      typeof conversationId === "string" && conversationId ? conversationId : null;
    trigger = typeof bodyTrigger === "string" ? bodyTrigger : null;
    mode = parseMode(bodyMode);
  } catch {
    return Response.json(
      { error: "Request body must be JSON with a `messages` array." },
      { status: 400 },
    );
  }

  if (!messages.every(hasValidMessageShape)) {
    return Response.json({ error: "Invalid message format." }, { status: 400 });
  }

  // The newest message is the one this turn is about — the only message
  // that can ever legitimately carry a fresh image attachment. Computed
  // once, up front, so it's available both for this validation and for the
  // persistence step further down.
  const newUserMessage = messages[messages.length - 1];

  const imageValidation = validateImageParts(newUserMessage?.parts ?? []);
  if (!imageValidation.ok) {
    return Response.json({ error: imageValidation.error }, { status: 400 });
  }
  if (mode === "fast" && imageValidation.hasImage) {
    return Response.json(
      {
        error: "Fast mode doesn't support images. Switch to Auto or Vision mode to send an image.",
      },
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

  // Persisted independent of whether the assistant's response below
  // succeeds. Skipped on a retry of an *established* conversation
  // (`trigger: "regenerate-message"` with a known conversationId) — that
  // resends an already-persisted message, not a new one. A retry of the
  // very first message is different: if the original request failed before
  // the client ever learned a conversationId, nothing was persisted yet, so
  // it must still be treated as an initial submission or the message is lost.
  const isRetryOfEstablishedConversation =
    trigger === "regenerate-message" && requestedConversationId !== null;
  if (!isRetryOfEstablishedConversation && newUserMessage?.role === "user") {
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: extractText(newUserMessage),
      // No permanent image storage: strip any attached image before it
      // ever reaches Supabase. A resumed/reloaded conversation will show
      // this turn's text but not the image — the image only ever lives in
      // the browser's in-memory chat state and this one model call.
      parts: withoutImageParts(newUserMessage.parts),
    });
    if (error) {
      console.error("[api/chat] failed to persist user message:", error.message);
      return Response.json({ error: "Could not save your message." }, { status: 500 });
    }
  }

  const model = resolveModel(mode, imageValidation.hasImage);

  // Only the turn actually routed to the vision model may send image
  // content to the provider — otherwise an image attached earlier in this
  // same conversation would still be sitting in history and get sent to a
  // model that can't accept it.
  const messagesForModel =
    model === visionModel
      ? messages
      : messages.map((message) => ({ ...message, parts: withoutImageParts(message.parts) }));

  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(messagesForModel);
  } catch {
    return Response.json({ error: "Invalid message format." }, { status: 400 });
  }

  const result = streamText({
    model,
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
    // Groq is fast enough that a whole response can arrive in one or two
    // real network chunks — this re-chunks it into a steady word-by-word
    // stream so the client sees a genuine progressive reveal.
    //
    // Ours, not the AI SDK's `smoothStream`: that paces `reasoning-delta`
    // chunks at the same rate as text, but ChatInterface.tsx never renders
    // reasoning parts, so smoothing them would just add latency nobody sees.
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
    // Runs once the assistant's turn is done (success, error, or abort) —
    // `onEnd`, not the deprecated `onFinish`. Persistence happens after the
    // stream, not in place of it, so the client keeps seeing tokens live.
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

      // Feeds Explore's knowledge graph: each quiz/flashcard/addKnowledgeTopic
      // call this turn becomes (or updates) a node. try/catch on top of
      // upsertKnowledgeNodeActivity's own handling — a failed write here must
      // never affect the chat response already streamed to the client.
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
