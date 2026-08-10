import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { chatModel, GENERATION_CONFIG, SYSTEM_PROMPT } from "@/lib/ai/config";

export async function POST(req: Request) {
  // Fail fast with an actionable message instead of letting the request
  // reach Anthropic and fail deep inside streamText, where the client only
  // ever sees the AI SDK's generic "An error occurred." stream error.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "[api/chat] ANTHROPIC_API_KEY is not set. Add it to .env.local at the project root.",
    );
    return Response.json(
      {
        error:
          "Server is not configured: ANTHROPIC_API_KEY is missing. Add it to .env.local and restart the dev server.",
      },
      { status: 500 },
    );
  }

  let messages: UIMessage[];

  try {
    const body = await req.json();
    if (!Array.isArray(body?.messages)) {
      throw new Error("`messages` must be an array");
    }
    messages = body.messages;
  } catch {
    return Response.json(
      { error: "Request body must be JSON with a `messages` array." },
      { status: 400 },
    );
  }

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: chatModel,
    instructions: SYSTEM_PROMPT,
    messages: modelMessages,
    ...GENERATION_CONFIG,
  });

  return result.toUIMessageStreamResponse({
    onError(error) {
      // Logged server-side only, for local diagnosis. The AI SDK already
      // keeps the client-facing message generic by default; we keep that
      // behavior explicit here rather than forwarding `error` to the client.
      console.error("[api/chat] streamText error:", error);
      return "Something went wrong while generating a response. Please try again.";
    },
  });
}
