# Lumora

Built Lumora as an AI-powered study companion. You chat with it to learn a topic, and it can
turn that conversation into a quiz, a set of flashcards, or a tracked entry in your personal
**Knowledge Space** — an interactive 3D graph that grows as you study and remembers how you like
it arranged.

## Production

Deployed this on [Vercel](https://vercel.com): **https://lumora-z1.vercel.app**

Verified the app locally with the checks under [Testing](#testing) (TypeScript, lint, unit tests,
build, Playwright) before every deploy; a full production smoke test against the live URL above
hasn't been run yet.

## Features

- **AI chat (`/generate`)** — a streaming conversational assistant built on Groq + the Vercel AI
  SDK, with multi-turn history, Stop-generation, and Markdown rendering that's safe mid-stream.
- **Model routing (Auto / Fast / Vision)** — you pick a mode; `Auto` sends text to a
  general-purpose model and routes images to a vision model automatically, `Fast` is text-only for
  quicker replies, and `Vision` forces the vision model. See [`lib/ai/config.ts`](lib/ai/config.ts).
- **Tool calling** — the model can call `createQuiz`, `createFlashcards`, or `addKnowledgeTopic`
  server-side tools, which render as real interactive UI (not JSON) in Generate's Resources panel.
- **Image / vision extraction** — attach an image and Lumora transcribes and summarizes its
  study-relevant content (text, diagrams, key concepts) via a dedicated vision-model call, shown as
  a review card with "Create Quiz" / "Create Flashcards" / "Ask about this" follow-up actions.
- **Interactive 3D Knowledge Space (`/explore`)** — every topic you study becomes a node in a 3D
  graph, connected to related topics and nested under broader categories automatically. See
  [§ 3D Knowledge Space](#3d-knowledge-space-explore) below.
- **Persistent node positions** — drag a node in Explore and its position is saved per-user, so the
  graph looks the same next time you visit it.
- **Quizzes & flashcards** — generated from any chat conversation, stored per-user, and browsable
  from Generate's Resources panel.
- **Conversation history (`/history`)** — past conversations are listed and can be reopened.
- **Settings (`/settings`)** — account info, theme (system/light/dark), and a Generate accent color.
- **Authentication** — email/password sign-up, sign-in, sign-out, and password reset via Supabase
  Auth; every protected route requires a signed-in user.
- **Reduced-motion & WebGL fallback** — Explore renders a static 2D map instead of the 3D canvas
  when `prefers-reduced-motion` is set or WebGL is unavailable, with identical topic selection.
- **Keyboard-accessible graph** — every Explore topic is also a real, focusable HTML control (a
  listbox on desktop, button chips on mobile), driving the same selection state as the 3D nodes.

`/settings` and `/history` are fully implemented, not placeholders. `/health` is a self-check page
that reports whether the app rendered and whether `GROQ_API_KEY` is configured — it doesn't
contact any external service.

## Tech stack

Built with:

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS 4](https://tailwindcss.com)
- [Supabase](https://supabase.com) (`@supabase/ssr`, `@supabase/supabase-js`) — authentication,
  Postgres database, and Row Level Security
- [Groq](https://groq.com) (`@ai-sdk/groq`) — the model provider
- [Vercel AI SDK](https://ai-sdk.dev) (`ai`, `@ai-sdk/react`) — streaming, tool calling, `useChat`
- [Zod](https://zod.dev) — schema validation for tool inputs and AI structured output
- [three.js](https://threejs.org) / [React Three Fiber](https://r3f.docs.pmnd.rs) /
  [drei](https://github.com/pmndrs/drei) — the `/explore` 3D Knowledge Space
- [Streamdown](https://github.com/vercel/streamdown) — streaming-safe Markdown rendering
- [Radix UI](https://www.radix-ui.com) / [shadcn](https://ui.shadcn.com) — accessible UI primitives
- [GSAP](https://gsap.com) — entrance/transition animations, skipped under reduced motion
- [Vitest](https://vitest.dev) + [Testing Library](https://testing-library.com) — unit/component tests
- [Playwright](https://playwright.dev) — end-to-end tests
- [Vercel](https://vercel.com) — hosting/deployment

## Local setup

Here's how to get this running on your machine:

1. **Clone and install**

   ```bash
   git clone https://github.com/jstmoizz/lumora.git
   cd lumora
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is fine).

3. **Run the database schema** — open the Supabase SQL Editor for your new project and paste in
   the entire contents of [`supabase/schema.sql`](supabase/schema.sql), then run it once. This
   creates every table, enum, trigger, and RLS policy Lumora needs (`users`, `conversations`,
   `messages`, `user_settings`, `knowledge_nodes`, `knowledge_node_positions`).

4. **Configure environment variables** — copy `.env.example` to `.env.local` and fill in the
   values described in the [Environment variables](#environment-variables) table below. The
   Supabase URL/anon key come from Project Settings → API in the Supabase dashboard; the Groq key
   comes from [console.groq.com](https://console.groq.com).

5. **Start the dev server**

   ```bash
   npm run dev
   ```

   The app runs at **http://localhost:3000**. Sign up for an account at `/signup` to reach
   `/generate` and `/explore`.

## Environment variables

| Variable | Required | Visibility | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public (browser-safe) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public (browser-safe) | Supabase anonymous key — safe to expose; RLS is the actual access control |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Server-only secret** | Bypasses RLS entirely; used only by `lib/supabase/admin.ts` |
| `GROQ_API_KEY` | Yes | **Server-only secret** | Groq API access for chat/vision generation |
| `ADMIN_EMAIL` | Optional | **Server-only secret** | Email of the account granted the `admin` role |

`NEXT_PUBLIC_`-prefixed variables are bundled into client-side JavaScript by Next.js — that's fine
for the Supabase URL/anon key, since Supabase's Row Level Security is the real access boundary,
not secrecy of those two values. **`SUPABASE_SERVICE_ROLE_KEY` is never prefixed with
`NEXT_PUBLIC_` or imported from a client component** — doing so would ship full database-bypass
access to every visitor's browser.

## Database

Supabase handles both authentication and persistence. `auth.users` (managed by Supabase Auth) is
the identity table; `public.users` is a profile row kept in sync by a trigger. Row Level Security
is enabled on every other table (`conversations`, `messages`, `user_settings`, `knowledge_nodes`,
`knowledge_node_positions`) with `user_id`-scoped policies, so one user's data is unreachable by
another at the database level — not just hidden by application logic.

`knowledge_node_positions` is a separate table from `knowledge_nodes` rather than extra columns on
it, because a position only exists once a user has actually dragged a node — most nodes use the
automatic layout and never get a row here at all. Keeping it separate also means writing a dragged
position never touches (or risks corrupting) the node's own study data.

`supabase/schema.sql` is the single source of truth for the schema — run it once against a fresh
project to set everything up (see [Local setup](#local-setup)).

## Architecture

```
Browser
  ↓
Next.js App Router (React Server + Client Components)
  ↓
API routes / Server Actions
  ↓
Supabase (auth + Postgres + RLS)   Groq (via Vercel AI SDK)
```

### Chat → Knowledge Graph flow

```
User message
  → authenticated POST /api/chat
  → model call via streamText (tool calling enabled)
  → a tool (createQuiz / createFlashcards / addKnowledgeTopic) is called
  → tool output persisted to the knowledge graph immediately (onStepEnd)
  → model's short follow-up acknowledgment streams to the client
  → full assistant message persisted once the turn ends
```

The knowledge-graph write happens as soon as the tool-calling step finishes (`onStepEnd`), not
after the whole turn completes. The AI SDK's default is a single step, which would end the turn
immediately after a tool call with no room for the model to comment — `stopWhen: stepCountIs(2)`
gives it one more step to acknowledge briefly, and the graph write doesn't wait around for that
second step to also finish.

## 3D Knowledge Space (`/explore`)

An interactive 3D visualization (React Three Fiber / Three.js) of the topics you've studied and
how they relate. Each studied topic becomes a node; quizzes, flashcards, and manually-added
topics all feed the same graph, nested under broader categories where the model identifies one.

- **Selection** — click a node, or use the accessible HTML topic list/chips alongside the canvas;
  both drive the same selection state, so the graph is fully usable without a mouse.
- **Camera** — smoothly focuses on the selected node while keeping the central "Lumora" node and
  surrounding context in view, rather than panning them out of frame.
- **Dragging & persisted positions** — a node can be manually repositioned; the new position is
  saved per-user and restored on the next visit.
- **Reduced-motion / WebGL fallback** — if `prefers-reduced-motion` is set or WebGL isn't
  available, a static 2D map (HTML + SVG) renders instead, with identical topic selection.
- **Mobile** — one-finger orbit and pinch-zoom, a responsive (not full-height) canvas panel, and a
  thinned-out ambient background on coarse-pointer devices.

## AI architecture

- **Provider**: Groq, accessed through the Vercel AI SDK's `streamText`/`generateText`.
- **Model routing**: `lib/ai/config.ts` resolves a text or vision model based on the selected mode
  (Auto / Fast / Vision) and whether the message carries an image; `Fast` never routes to vision.
- **Tool calling**: three server-side tools (`createQuiz`, `createFlashcards`,
  `addKnowledgeTopic`), each with a Zod input schema that validates and bounds the model's output
  before it's ever persisted or rendered (see [`lib/ai/tools.ts`](lib/ai/tools.ts)).
- **Vision extraction**: a separate, tool-free `generateText` call
  ([`lib/ai/extraction.ts`](lib/ai/extraction.ts)) forces a single internal "record what you saw"
  tool call to get structured output back from the vision model, since `generateObject`'s
  `response_format` mode fails for this model with image input on Groq.
- **Error classification**: raw provider errors (rate limits, 5xx, etc.) never reach the client —
  [`lib/ai/errors.ts`](lib/ai/errors.ts) reduces them to one of three safe codes (`RATE_LIMITED`,
  `PROVIDER_UNAVAILABLE`, `GENERATION_FAILED`) before they cross the wire.
- **Resource limits**: capped message-array length and per-message text length, a capped image
  size/type, bounded output-token limits on every AI call, and bounded field lengths on every tool
  and the vision-extraction schema — see [Security / production hygiene](#security--production-hygiene).

## Security / production hygiene

- **Authentication**: Supabase Auth handles identity; `requireUser()` resolves it from the
  server-side session only — never from anything the client sends — and rejects unauthenticated
  requests with 401.
- **Row Level Security**: every user-owned table is scoped by `user_id`, enforced by Postgres.
- **Server-only secrets**: `SUPABASE_SERVICE_ROLE_KEY` and `GROQ_API_KEY` are only read in
  server-side modules, never in anything a client component imports.
- **Input caps on `/api/chat`**: the request is rejected with `400` before any DB or AI work if
  the `messages` array exceeds 100 entries or any single message's text exceeds 8,000 characters
  (`lib/ai/model.ts`). Image attachments are separately capped at one per message, 3 MB, and
  JPEG/PNG/WebP only.
- **Per-user rate limiting**: `/api/chat` allows 20 requests per user per rolling 60-second window
  (`lib/api/rate-limit.ts`), checked after authentication so unauthenticated traffic is still
  stopped by the 401 boundary first. Exceeding it returns `429` with a `Retry-After` header. The
  limiter is an in-memory `Map` keyed by user id, with stale entries swept out periodically so it
  can't grow unbounded.

  **This limiter is intentionally lightweight and process-local; it protects the single capstone
  deployment from trivial abuse but isn't meant to replace distributed rate limiting at larger
  scale.** A multi-instance deployment would need a shared store (e.g. Redis/Upstash) for the
  limit to hold across instances — out of scope for this project.
- **Streaming timeout**: `/api/chat` sets `export const maxDuration = 60`, giving a streamed
  response with tool calls a realistic ceiling without leaving a function to run indefinitely.
- **Vision-extraction limits**: the extraction schema bounds `summary`, `extractedContent`, and
  `keyConcepts` lengths, and the underlying `generateText` call sets `maxOutputTokens`, so a
  pathological image can't produce an unbounded response.
- **Knowledge-node position validation**: `saveKnowledgeNodePosition` rejects `NaN`/`Infinity`/
  non-numeric coordinates with `Number.isFinite()` before writing to the database.
- **Safe AI error handling**: see [AI architecture](#ai-architecture) above — provider/model
  details never reach the client.

## Testing

These are the commands to run to verify the app:

```bash
npx tsc --noEmit      # TypeScript
npm run lint           # ESLint
npx vitest run         # Unit / component tests (Vitest + Testing Library)
npm run build          # Production build
npx playwright test    # End-to-end tests (Chromium)
```

## Important design decisions

- **Chose Supabase + RLS** over a hand-rolled auth/authorization layer — access control is
  enforced by Postgres itself, not application code that could have a bug in it.
- **Kept `knowledge_node_positions` as a separate table** rather than columns on
  `knowledge_nodes` — most nodes never get manually dragged, so most nodes never need a position
  row at all.
- **Gave Explore a static/reduced-motion fallback** — the graph's meaning (topics, relationships,
  selection) shouldn't depend on WebGL support or a user's motion preference; the fallback keeps
  identical functionality, just without the 3D canvas.
- **Used tool calling for quizzes/flashcards/knowledge topics** — lets the model produce
  structured, Zod-validated data that renders as real UI, instead of parsing a written response
  after the fact.
- **Knowledge-graph writes happen at tool-step completion, not turn completion** — so the graph
  reflects what was just studied immediately, not only once the model's follow-up sentence also
  finishes generating.
- **Chose in-memory rate limiting instead of Redis/Upstash** — this is a single-instance capstone
  deployment; adding an external dependency purely for rate limiting would be infrastructure the
  project doesn't otherwise need. See the caveat under [Security](#security--production-hygiene).

## AI-Assisted Development

AI tools were used throughout this project's development, with every step reviewed personally —
generated code was read, tested, and verified rather than accepted as-is.

- **Claude Code** — used for implementation, debugging, and refactoring across the codebase,
  including production-hygiene work like rate limiting, input caps, vision-extraction bounds, and
  this README.
- **ChatGPT** — used for architecture discussion, debugging sessions, and planning, including
  working through the Vercel AI SDK's step/tool-calling lifecycle and Groq-specific quirks (e.g.
  why `generateObject`'s `response_format` mode fails with image input on the vision model, which
  led to the forced-tool-call workaround in `lib/ai/extraction.ts`).
- **Test generation and review** — unit and E2E tests were drafted with AI assistance, then read,
  run, and adjusted by hand; new tests follow the same pattern.
- **Accessibility and performance analysis** — AI assistance informed Explore's
  keyboard-accessible HTML controls, reduced-motion fallback, and WebGL fallback.
- **Debugging Groq's tool calling** — AI assistance helped track down that Groq sometimes emits
  `""` for an omitted optional field instead of leaving the key out, handled in
  `lib/ai/tools.ts`'s `optionalNonBlankString`.
- **Knowledge-graph persistence work** — AI assistance helped work out moving the graph write from
  the turn's `onEnd` to the tool step's `onStepEnd`, and the topic/category-nesting resolution
  logic.
- **Human verification** — every change is checked against the actual codebase before being made
  (never assumed from a spec), validated with `tsc`, `eslint`, the full Vitest suite, a production
  build, and the Playwright suite, and cross-checked against the existing test suite to confirm
  nothing regresses.

## Cross-browser verification

Automated E2E coverage (Playwright) runs on **Chromium** only — see
[`playwright.config.ts`](playwright.config.ts); no Firefox/WebKit projects are configured, and
Firefox/WebKit browser binaries aren't installed in the usual dev environment.

| Area | Chrome (Chromium) | Firefox | Safari | Mobile Safari |
|---|---|---|---|---|
| Auth (sign up / sign in / sign out) | Tested (Playwright) | Not tested in this environment | Not tested in this environment | Tested (manual) |
| Generate (chat, streaming, quiz/flashcards) | Tested (Playwright) | Not tested in this environment | Not tested in this environment | Tested (manual) |
| Explore (select, keyboard-select, drag, persisted position, fallback) | Tested (Playwright) | Not tested in this environment | Not tested in this environment | Tested (manual) |
| Mobile layout / touch | Not tested in this environment | Not tested in this environment | Not tested in this environment | Tested (manual) |

Mobile Safari was tested manually on a real device, covering the areas above. Desktop Safari and
Firefox weren't — treat those "Not tested" cells as genuinely unverified, not passing.
