# Lumora

## 1. Overview

Lumora is a Next.js study assistant application. The currently implemented feature is the **central AI chat/generation interface**: a streaming conversational assistant, available at [`/generate`](app/generate), that lets a user ask questions and receive answers from an LLM in real time.

Other routes in the app (`/about`, `/history`, `/settings`) are placeholder pages for future work and are not part of this implementation.

## 2. Key implemented features

- **Streaming AI responses** — assistant replies render incrementally as tokens arrive, rather than waiting for the full response.
- **Groq API integration through the Vercel AI SDK** — the chat route uses `streamText` from the `ai` package with the `@ai-sdk/groq` provider.
- **`useChat`-based conversation state** — client-side conversation state (`@ai-sdk/react`) drives message history, submission, and streaming status.
- **Thinking indicator** — a "Thinking…" state is shown from the moment a message is submitted until the first token of the assistant's reply arrives, with no visible flicker at the handoff.
- **Stop generation** — an in-progress response can be cancelled via a Stop button.
- **Partial response preservation** — text already streamed in before Stop is pressed remains in the conversation rather than being discarded.
- **Multi-turn conversations** — conversation history persists and is sent back to the model on each new message, so follow-up questions have context.
- **Streaming-safe Markdown rendering** — assistant output is rendered with [Streamdown](https://github.com/vercel/streamdown), which handles incomplete/in-progress Markdown safely while tokens are still streaming in.
- **Auto-scroll while following the latest response** — the message list scrolls to keep the newest content in view as it streams.
- **Scroll lock when the user scrolls upward** — auto-scroll disengages as soon as the user manually scrolls away from the bottom, so it doesn't fight manual scrolling.
- **Jump-to-latest button** — appears once the user has scrolled away from the bottom, and returns to the latest message without stealing focus from the input.
- **Responsive/mobile-friendly layout** — the chat UI and page shell use responsive Tailwind classes and remain usable at phone width.
- **Server-side API key handling** — the Groq API key is read only on the server and is never sent to or accessible from the client.

## 3. Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev)
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS 4](https://tailwindcss.com)
- [Vercel AI SDK](https://ai-sdk.dev) (`ai`, `@ai-sdk/react`)
- [Groq](https://groq.com) (`@ai-sdk/groq`) — the model provider used for chat generation
- [Streamdown](https://github.com/vercel/streamdown) — streaming-safe Markdown rendering
- [Radix UI](https://www.radix-ui.com) / [shadcn](https://ui.shadcn.com) — the `Button` component used in the chat UI (`components/ui/`)

## 4. Architecture

```
ChatInterface → /api/chat → AI SDK → Groq
                                   ↓
                            streamed response
                                   ↓
                            Streamdown → UI
```

- `app/generate/ChatInterface.tsx` is the client component that manages conversation state via `useChat` and renders messages, the thinking indicator, and the Stop/Send controls.
- It sends the conversation to `app/api/chat/route.ts`, a server route handler.
- The route handler calls `streamText` (Vercel AI SDK) using the model and settings centralized in `lib/ai/config.ts`, which configures the Groq provider.
- The response is streamed back to the client as it's generated.
- On the client, incoming assistant text is rendered through Streamdown, which safely renders Markdown even while it's still incomplete mid-stream.

The Groq API key is read from the server environment (`GROQ_API_KEY`) inside `lib/ai/config.ts` and is never passed to or exposed in client-side code.

## 5. Local setup

```bash
npm install
```

Create a `.env.local` file in the project root and add:

```
GROQ_API_KEY=your_key_here
```

Then start the dev server:

```bash
npm run dev
```

The chat interface is available at `/generate`.

## 6. Environment & security notes

- `.env.local` must never be committed. It is excluded via `.gitignore` (`.env*`, with `.env.example` explicitly excepted).
- `.env.example` contains only a placeholder value (`GROQ_API_KEY=your_api_key_here`) and is safe to commit.
- The API key is only ever read server-side (inside `lib/ai/config.ts`); no client code imports it.

## 7. Verification

The following checks have been run successfully against the current implementation:

- TypeScript — `npx tsc --noEmit`
- ESLint — `npx eslint .`
- Production build — `npx next build`
- Manual testing of streaming responses, Stop generation, multi-turn conversation, Markdown rendering, and scrolling behavior (auto-scroll, scroll lock, jump-to-latest)
