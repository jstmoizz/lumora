import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isTextUIPart,
  stepCountIs,
  streamText,
  type StepResult,
} from "ai";
import {
  GENERATION_CONFIG,
  SYSTEM_PROMPT,
  isE2eMockAiEnabled,
  resolveModel,
  visionModel,
} from "@/lib/ai/config";
import { classifyAIError } from "@/lib/ai/errors";
import { extractImageContent, type ImageExtraction } from "@/lib/ai/extraction";
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
// call to summarize it.
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

// `content` is a display/search convenience derived from `parts` (the
// source of truth) — null when a message has no text part at all.
function extractText(message: LumoraUIMessage): string | null {
  const text = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
  return text || null;
}

// Guards each message before title/extraction or convertToModelMessages()
// call `.parts.filter(...)` on it — a missing `parts` would otherwise throw
// past the try/catch around model-message conversion.
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

// Strips attachment parts only; text/tool/reasoning parts pass through.
// Used both to keep images out of Supabase and out of non-vision model calls.
function withoutImageParts(parts: LumoraUIMessage["parts"]): LumoraUIMessage["parts"] {
  return parts.filter((part) => !isFilePart(part));
}

// The extraction is rendered client-side as a structured `data-extraction`
// part (ChatInterface.tsx's ExtractionCard), but `convertToModelMessages`
// silently drops `data-*` parts — this plain-text mirror rides alongside it
// so a later "Create Quiz"/"Create Flashcards" turn (routed to GPT-OSS, not
// Qwen) can still see what was found in the image. ChatInterface.tsx hides
// this text whenever a `data-extraction` part is also present.
function formatExtractionAsText(extraction: ImageExtraction): string {
  const sections = [
    extraction.title ? `**${extraction.title}**` : null,
    extraction.summary,
    extraction.extractedContent,
    extraction.keyConcepts.length > 0 ? `Key concepts: ${extraction.keyConcepts.join(", ")}` : null,
  ].filter((section): section is string => Boolean(section));
  return sections.join("\n\n");
}

const ALLOWED_IMAGE_SUBTYPES = ALLOWED_IMAGE_MEDIA_TYPES.map((type) => type.split("/")[1]).join("|");
const IMAGE_DATA_URL_PATTERN = new RegExp(
  `^data:image/(?:${ALLOWED_IMAGE_SUBTYPES});base64,([A-Za-z0-9+/]+=*)$`,
);

// Re-derives byte size from the transmitted base64 payload rather than
// trusting the client's own claim about file size.
function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// Validates the newest message's image attachment(s) against the app's
// attachment policy. A remote URL smuggled in as a "file" part is rejected
// by the same pattern that checks allowed media types.
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
  // /generate being a protected page isn't enough on its own, since this
  // route can be hit directly. Identity comes only from the already-
  // validated session, never from anything the client sends.
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  // Fail fast with an actionable message instead of failing deep inside
  // streamText, where the client only sees a generic stream error. Skipped
  // only when the E2E mock model is active (see lib/ai/mockModel.ts) —
  // that path never touches Groq.
  if (!process.env.GROQ_API_KEY && !isE2eMockAiEnabled()) {
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

  // The only message that can legitimately carry a fresh image attachment.
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
    // RLS-scoped, so a conversation owned by someone else simply isn't
    // returned — this one query is both the existence and ownership check.
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

  // Persisted regardless of whether the assistant's response succeeds.
  // Skipped on a retry of an *established* conversation, which resends an
  // already-persisted message — but a retry of the very first message
  // (before a conversationId ever existed) still needs to persist, or it's lost.
  const isRetryOfEstablishedConversation =
    trigger === "regenerate-message" && requestedConversationId !== null;
  if (!isRetryOfEstablishedConversation && newUserMessage?.role === "user") {
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: extractText(newUserMessage),
      // No permanent image storage — a reloaded conversation shows this
      // turn's text but not the image.
      parts: withoutImageParts(newUserMessage.parts),
    });
    if (error) {
      console.error("[api/chat] failed to persist user message:", error.message);
      return Response.json({ error: "Could not save your message." }, { status: 500 });
    }
  }

  const model = resolveModel(mode, imageValidation.hasImage);

  // Each createQuiz/createFlashcards/addKnowledgeTopic call becomes a node
  // in Explore. Persisted from onStepEnd (below), as soon as the
  // tool-containing step finishes — not from onEnd, which only runs after
  // the second, acknowledgment-only model step also completes. A failed
  // write here must never affect the already-streamed chat response.
  async function persistKnowledgeGraphToolResults(
    toolResults: StepResult<typeof lumoraTools>["toolResults"],
  ) {
    for (const toolResult of toolResults) {
      try {
        if (toolResult.toolName === "createQuiz" && !toolResult.dynamic) {
          await upsertKnowledgeNodeActivity(supabase, userId, {
            label: toolResult.output.topic,
            kind: "quiz",
            relatedTopics: toolResult.output.relatedTopics,
            category: toolResult.output.category,
          });
        } else if (toolResult.toolName === "createFlashcards" && !toolResult.dynamic) {
          await upsertKnowledgeNodeActivity(supabase, userId, {
            label: toolResult.output.topic,
            kind: "flashcards",
            relatedTopics: toolResult.output.relatedTopics,
            category: toolResult.output.category,
          });
        } else if (toolResult.toolName === "addKnowledgeTopic" && !toolResult.dynamic) {
          await upsertKnowledgeNodeActivity(supabase, userId, {
            label: toolResult.output.topic,
            kind: "manual",
            relatedTopics: toolResult.output.relatedTopics,
            category: toolResult.output.category,
            summary: toolResult.output.summary,
          });
        }
      } catch (knowledgeGraphError) {
        console.error(
          "[api/chat] failed to update knowledge graph:",
          knowledgeGraphError,
        );
      }
    }
  }

  // Runs once the turn is done (success, error, or abort) — shared between
  // the normal streamText path and the image extraction-only path, which
  // need identical persistence behavior. Runs after the stream, not in
  // place of it, so the client keeps seeing tokens live. Knowledge-graph
  // writes already happened in onStepEnd — this only persists the final
  // assistant message and bumps the conversation's timestamp.
  async function persistAssistantTurn({
    responseMessage,
    isAborted,
    finishReason,
  }: {
    responseMessage: LumoraUIMessage;
    isAborted: boolean;
    finishReason?: string;
  }) {
    // No `finish` event (the model call failed) or the user hit Stop —
    // never write a partial/fake assistant message.
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
  }

  // An image turn routed to the vision model goes through a dedicated
  // extraction-only call (lib/ai/extraction.ts) instead of the normal
  // tool-enabled request. The extraction renders as a review card with
  // "Create Quiz"/"Create Flashcards"/"Ask about this" actions — the user
  // decides what happens next. Those actions are just a normal follow-up
  // message; the streamText branch below already handles it, picking up
  // the extraction from this turn's text part as ordinary history.
  if (model === visionModel && imageValidation.hasImage) {
    const imagePart = newUserMessage.parts.find(isFilePart);
    // imageValidation.hasImage already guarantees this exists.
    if (!imagePart) {
      return Response.json({ error: "Invalid message format." }, { status: 400 });
    }

    const stream = createUIMessageStream<LumoraUIMessage>({
      execute: async ({ writer }) => {
        writer.write({ type: "start", messageMetadata: { conversationId } });
        writer.write({ type: "start-step" });

        const extraction = await extractImageContent({
          image: {
            mediaType: imagePart.mediaType,
            filename: imagePart.filename,
            url: imagePart.url,
          },
          userText: extractText(newUserMessage) ?? undefined,
        });

        writer.write({ type: "data-extraction", id: "extraction", data: extraction });

        const extractionText = formatExtractionAsText(extraction);
        writer.write({ type: "text-start", id: "extraction-text" });
        writer.write({ type: "text-delta", id: "extraction-text", delta: extractionText });
        writer.write({ type: "text-end", id: "extraction-text" });

        writer.write({ type: "finish-step" });
        writer.write({ type: "finish" });
      },
      onError: (error) => {
        // Logged server-side only — the client sees just the safe
        // classification below, never the raw error.
        console.error("[api/chat] image extraction failed:", error);
        return classifyAIError(error);
      },
      onEnd: persistAssistantTurn,
    });

    return createUIMessageStreamResponse({ stream });
  }

  // Only the turn routed to the vision model may send image content —
  // otherwise an image from earlier in the conversation would reach a
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
    // tool call with no room to comment on the result. Two steps lets it
    // call createQuiz/createFlashcards and then acknowledge it briefly.
    stopWhen: stepCountIs(2),
    // Fires after each step, including the tool-containing one — persists
    // the knowledge-graph write before the second (acknowledgment) step
    // even starts, instead of waiting for the whole turn to finish.
    onStepEnd: (step) => persistKnowledgeGraphToolResults(step.toolResults),
    // Groq can return a whole response in one or two network chunks — this
    // re-chunks it into a steady word-by-word stream. Ours, not the AI
    // SDK's smoothStream, since that also paces reasoning-delta chunks,
    // which ChatInterface.tsx never renders anyway.
    experimental_transform: smoothTextStream({ chunking: "word", delayInMs: 20 }),
    ...GENERATION_CONFIG,
  });

  return result.toUIMessageStreamResponse<LumoraUIMessage>({
    // Attaches the conversation id the instant the stream starts, so the
    // client can read it from message.metadata mid-stream. Metadata set on
    // `start` merges into `finish`, so this doesn't need repeating.
    messageMetadata: ({ part }) =>
      part.type === "start" ? { conversationId } : undefined,
    onEnd: persistAssistantTurn,
    onError(error) {
      console.error("[api/chat] streamText error:", error);
      return classifyAIError(error);
    },
  });
}
