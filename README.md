# Lumora

## 1. Overview

Lumora is a Next.js study assistant application. The currently implemented feature is the **central AI chat/generation interface**: a streaming conversational assistant, available at [`/generate`](app/generate), that lets a user ask questions and receive answers from an LLM in real time.

Other product routes in the app (`/about`, `/history`, `/settings`) are placeholder pages for future work and are not part of this implementation. [`/explore`](app/explore) is a second implemented feature — an abstract 3D visualization of how study topics relate to each other; see [§10](#10-lumora-knowledge-space-explore).

Two auxiliary routes exist outside the main nav ([`NavBar.tsx`](app/components/NavBar.tsx) links only Home/Generate/History/About/Settings):

- [`/health`](app/health/page.tsx) — a server-rendered status page that pings an external API and reports operational/unavailable.
- [`/playground`](app/playground) — a dev-only area for coursework exercises (hand-built ARIA patterns and a state-driven animated button); see [§6](#6-playground).

## 2. Key implemented features

- **Streaming AI responses** — assistant replies render incrementally as tokens arrive, rather than waiting for the full response.
- **Groq API integration through the Vercel AI SDK** — the chat route uses `streamText` from the `ai` package with the `@ai-sdk/groq` provider.
- **`useChat`-based conversation state** — client-side conversation state (`@ai-sdk/react`) drives message history, submission, and streaming status.
- **Thinking indicator** — a "Thinking…" state is shown from the moment a message is submitted until the first token of the assistant's reply arrives, with no visible flicker at the handoff.
- **Stop generation** — an in-progress response can be cancelled via a Stop button.
- **Partial response preservation** — text already streamed in before Stop is pressed remains in the conversation rather than being discarded.
- **Multi-turn conversations** — conversation history persists and is sent back to the model on each new message, so follow-up questions have context.
- **Tool calling / generative UI** — the assistant can call a server-side `createQuiz` tool to generate an interactive multiple-choice quiz, rendered as a real UI component (not a JSON dump) with a distinct visual state for each stage of the call — see [§5](#5-tool-calling).
- **Streaming-safe Markdown rendering** — assistant output is rendered with [Streamdown](https://github.com/vercel/streamdown), which handles incomplete/in-progress Markdown safely while tokens are still streaming in.
- **Auto-scroll while following the latest response** — the message list scrolls to keep the newest content in view as it streams.
- **Scroll lock when the user scrolls upward** — auto-scroll disengages as soon as the user manually scrolls away from the bottom, so it doesn't fight manual scrolling.
- **Jump-to-latest button** — appears once the user has scrolled away from the bottom, and returns to the latest message without stealing focus from the input.
- **Responsive/mobile-friendly layout** — the chat UI and page shell use responsive Tailwind classes and remain usable at phone width.
- **Server-side API key handling** — the Groq API key is read only on the server and is never sent to or accessible from the client.
- **Route-level error boundary** — [`app/generate/error.tsx`](app/generate/error.tsx) catches rendering errors under `/generate` (e.g. from `ChatInterface`, GSAP, or Streamdown) and shows a recoverable "Try again" card instead of crashing the whole app; the root layout's nav keeps rendering above it.

## 3. Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev)
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS 4](https://tailwindcss.com)
- [Vercel AI SDK](https://ai-sdk.dev) (`ai`, `@ai-sdk/react`)
- [Groq](https://groq.com) (`@ai-sdk/groq`) — the model provider used for chat generation
- [Zod](https://zod.dev) — schema validation for the `createQuiz` tool's input
- [Streamdown](https://github.com/vercel/streamdown) — streaming-safe Markdown rendering
- [Radix UI](https://www.radix-ui.com) / [shadcn](https://ui.shadcn.com) — `components/ui/` (`Button`, and the generated `Dialog`/`Tabs` wrappers used for comparison in [§6](#6-playground))
- [GSAP](https://gsap.com) (`gsap`, `@gsap/react`) — entrance/transition animations across pages (Home, About, History, Settings, the `/generate` error card, `AnimatedSendButton`), skipped when `prefers-reduced-motion` is set
- [lucide-react](https://lucide.dev) — icon set used throughout the UI
- [three.js](https://threejs.org) / [React Three Fiber](https://r3f.docs.pmnd.rs) (`three`, `@react-three/fiber`) / [drei](https://github.com/pmndrs/drei) (`@react-three/drei`) — the `/explore` 3D knowledge space (see [§10](#10-lumora-knowledge-space-explore)); not used anywhere else in the app

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

## 5. Tool calling

Lumora's chat route registers two server-side tools with the AI SDK's `streamText`: `createQuiz` and `createFlashcards`. The model decides when to call each (e.g. when the user asks to be quizzed, or asks for flashcards) and supplies the content itself as the tool call's arguments; `execute` never makes a further model call of its own — it only validates and normalizes that content. `createFlashcards` mirrors `createQuiz`'s shape exactly (same validate-and-assign-ids `execute`, same per-item stable-id scheme) for a second activity type, so both render through the same Resources panel architecture described below rather than duplicated logic.

`SYSTEM_PROMPT` (in [`lib/ai/config.ts`](lib/ai/config.ts)) explicitly instructs the model not to restate a quiz's/flashcard set's content in its own written reply after calling either tool — the activity itself only ever renders in the Resources panel (see below), never as chat text, so the model is told to give a short one-sentence acknowledgment instead.

### `createQuiz`

Defined in [`lib/ai/tools.ts`](lib/ai/tools.ts), registered in [`app/api/chat/route.ts`](app/api/chat/route.ts).

**Input schema (Zod):**

```ts
z.object({
  topic: z.string().min(1).max(80),
  questions: z
    .array(
      z.object({
        question: z.string().min(1).max(300),
        options: z.array(z.string().min(1).max(120)).length(4),
        correctIndex: z.number().int().min(0).max(3),
      }),
    )
    .min(1)
    .max(5),
});
```

**`execute` behavior:** trims the topic and every question/option, assigns a stable id to the quiz and to each question, and validates that no question has duplicate answer options (case-insensitive) and that `correctIndex` points at a real, non-empty option. If any of that fails, it throws a plain `Error` — the AI SDK catches it and surfaces the tool's `output-error` state to the client with a readable message, instead of the request crashing.

**Return shape:**

```ts
{
  quizId: string;
  topic: string;
  questions: {
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
  }[];
}
```

### Client rendering — four lifecycle states, and where the activity actually lives

[`app/generate/PracticeToolPart.tsx`](app/generate/PracticeToolPart.tsx) exports `QuizToolPart`/`FlashcardsToolPart`, which render their tool call's message part differently for each state the AI SDK exposes on it (`ToolUIPart`'s `state` field) — but **never** the activity's own content, by design:

| State | What's shown |
|---|---|
| `input-streaming` | A generic skeleton card ("Lumora is preparing a quiz…" / "…flashcards…") — the arguments are still streaming in, so no partial JSON is rendered. |
| `input-available` | A "Building your quiz/flashcards on *{topic}*…" card — the arguments are fully parsed, `execute` hasn't resolved yet. |
| `output-available` | A compact ready notice only — e.g. "Quiz ready: {topic} · {N} questions · Open Resources to take it". The actual interactive quiz/flashcards render exclusively in Generate's Resources panel ([`app/generate/PracticePanel.tsx`](app/generate/PracticePanel.tsx) — internally still named "Practice"; only the user-facing label changed — tabbed Quizzes/Flashcards, see [`app/generate/QuizPanel.tsx`](app/generate/QuizPanel.tsx) and [`app/generate/FlashcardsPanel.tsx`](app/generate/FlashcardsPanel.tsx)), never duplicated into the chat itself. |
| `output-error` | A designed error card (icon + the thrown error's message) — not raw JSON, not an unhandled exception. |

The chat route also sets `stopWhen: stepCountIs(2)`, so the model gets a turn to comment after calling a tool instead of the AI SDK's single-step default ending the turn immediately after the tool call — `SYSTEM_PROMPT` keeps that comment short rather than a restatement (see above).

Every quiz/flashcard set generated in a session gets its own collapsible card in Resources (via the shared [`app/generate/Disclosure.tsx`](app/generate/Disclosure.tsx) and [`app/generate/useAutoCollapseList.ts`](app/generate/useAutoCollapseList.ts)) rather than replacing the last one — the newest opens automatically, the previously-auto-opened one collapses, and anything the user opened by hand is left alone. Disclosure keeps collapsed content mounted (hidden via the `hidden` attribute, not unmounted) specifically so a quiz's in-progress answers or a flashcard set's current card/flip side survive being collapsed and reopened; Resources' own Quizzes/Flashcards tabs use the same mount-and-hide approach (Radix `Tabs` with `forceMount`) so switching tabs preserves state too.

### Generate workspace — Recent Chats and conversation persistence

Generate is a three-column layout: Recent Chats (left) | chat (center) | Resources (right) on desktop, both side panels collapsing into drawers on mobile — see [`app/generate/GenerateWorkspace.tsx`](app/generate/GenerateWorkspace.tsx). Recent Chats is backed by the real `conversations` table (via `app/api/conversations/route.ts` and `app/api/conversations/[id]/route.ts`), not a session-only prompt log — selecting a row or clicking New Chat swaps the active conversation in place by remounting an internal `GenerateSession` (keyed by a bump counter), without a full page navigation.

The active conversation id is synced to the URL (`?conversationId=`) and to `sessionStorage` (not `localStorage`) as soon as it's known — `sessionStorage` is naturally per-tab, which is what lets the ongoing conversation survive navigating to another route and back within the same tab (and a plain refresh) while a brand-new tab still starts its own fresh session, per [`app/generate/activeConversationStorage.ts`](app/generate/activeConversationStorage.ts).

## 6. Playground

[`/playground`](app/playground/page.tsx) is a dev-only area (not linked from the main nav, not part of the product) that hosts two coursework exercises. It links out to three sub-pages and embeds a live demo directly on the page itself.

### Hand-built ARIA patterns vs. shadcn/ui

Three interaction patterns from the W3C ARIA Authoring Practices Guide were built by hand, then compared against the equivalent shadcn/ui-generated components:

| Exercise | Handmade | shadcn/Radix equivalent |
|---|---|---|
| Disclosure | [`app/playground/disclosure/Disclosure.tsx`](app/playground/disclosure/Disclosure.tsx) | — |
| Tabs | [`app/playground/tabs/Tabs.tsx`](app/playground/tabs/Tabs.tsx) | [`components/ui/tabs.tsx`](components/ui/tabs.tsx) |
| Modal | [`app/playground/modal/Modal.tsx`](app/playground/modal/Modal.tsx) | [`components/ui/dialog.tsx`](components/ui/dialog.tsx) |

The handmade components implement their own focus trapping, focus restoration, and keyboard handling (arrow keys/Home/End with roving `tabIndex` for Tabs; Escape + manual Tab-wrapping for Modal) and were confirmed correct by manual keyboard testing. The detailed behavioral diff against Radix's primitives (focusability detection, inert background isolation, portal rendering, RTL/orientation support, outside-click dismissal) is written up in [`NOTES.md`](NOTES.md).

### `AnimatedSendButton` ("Buttons with a Brain")

[`app/components/playground/AnimatedSendButton.tsx`](app/components/playground/AnimatedSendButton.tsx) is a reusable Send button driven by an explicit `idle → loading → success/error` state machine (`useReducer`), demoed live on the Playground page with toggles for a simulated success/error outcome and a disabled state. GSAP only ever reacts to the current state — it never decides it. Motion specifics (hover lift, a 220ms GSAP crossfade between states, a one-shot error shake, `animate-spin` for loading) are documented inline as `MOTION_DECISIONS` on the playground page, and all GSAP movement is skipped under `prefers-reduced-motion` while state/label/icon/color changes still happen immediately. This component is a standalone demo — it is not wired into the real `/generate` chat flow.

## 7. Local setup

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

## 8. Environment & security notes

- `.env.local` must never be committed. It is excluded via `.gitignore` (`.env*`, with `.env.example` explicitly excepted).
- `.env.example` contains only a placeholder value (`GROQ_API_KEY=your_api_key_here`) and is safe to commit.
- The API key is only ever read server-side (inside `lib/ai/config.ts`); no client code imports it.

## 9. Verification

The following checks have been run successfully against the current implementation:

- TypeScript — `npx tsc --noEmit`
- ESLint — `npx eslint .`
- Production build — `npx next build`
- Manual testing of streaming responses, Stop generation, multi-turn conversation, Markdown rendering, and scrolling behavior (auto-scroll, scroll lock, jump-to-latest)
- Manual testing of the `createQuiz` tool end-to-end (a "quiz me on..." prompt) and confirmation that a normal, non-quiz prompt still streams plain text exactly as before
- Direct testing of `createQuizTool`'s `execute` with deliberately invalid input (duplicate answer options) to confirm the `output-error` path
- `/explore`: topic selection (both the accessible topic-button list and the 3D/fallback nodes drive the same state), the topic panel's content and "Back to overview," keyboard-only activation of a topic button, `prefers-reduced-motion` emulation (Playwright's `page.emulateMedia`), manual mobile/touch verification (pinch-zoom, one-finger orbit, tap-to-select at phone width), and manual verification that forcing `canvas.getContext` to return `null` falls back to the static knowledge-space map instead of a blank area — see [§10](#10-lumora-knowledge-space-explore)
- `/explore` visual passes: manual screenshot comparison across desktop/mobile and light/dark for the overview composition, hover, and all 7 topic selections — specifically checking that the selected node, Lumora, and some surrounding context all stay visible and unobscured by `TopicPanel` (the previous off-axis-node framing bug this caught and fixed), and that reduced motion still renders the untouched `StaticFallback` with none of the color/glow/ambient additions

## 10. Lumora Knowledge Space (`/explore`)

An abstract 3D visualization of how the topics you study relate to each other — a central Lumora element with 7 knowledge nodes (Artificial Intelligence, Algorithms, Data Structures, Databases, Networks, Software Engineering, Mathematics) connected by thin, low-opacity lines. It exists to make "knowledge relationships" feel like a real, explorable space rather than a list, while staying restrained: dark background, muted indigo/violet (plus two cooler accent tones — see below), low-poly procedural geometry (no imported 3D models), no physics, no postprocessing, no particle effects.

**Composition — depth and hierarchy:** node positions in [`data.ts`](app/explore/data.ts) are hand-authored across a wide x/y/z spread (not a flat ring), so orbiting reveals real depth rather than just rotation. Each node also carries a `tier`: 3 "core" topics (AI, Algorithms, Mathematics — each already named foundational in its own summary text) render as the rounder `icosahedronGeometry`, closer in form to Lumora itself; the 4 "secondary" topics render as the sharper `octahedronGeometry`, both at a modestly smaller radius. The distinction is felt (size, shape, a touch more glow/connection opacity — see below) rather than labeled.

**Meaningful interaction — hover → select → focus → context:** hovering a node gives it a subtle scale/emissive response; clicking one sets it as the selected topic. [`CameraRig.tsx`](app/explore/components/CameraRig.tsx) then smoothly focuses the camera over ~700ms, coordinated with drei's `OrbitControls` rather than fighting it: the look-at target blends only partway (55%) from Lumora toward the selected node — so Lumora and the surrounding space stay in view instead of being panned out of frame — and the target additionally leans away from whichever side [`TopicPanel`](app/explore/TopicPanel.tsx) occupies (a right-side card on desktop above the panel's own 640px breakpoint, a bottom sheet below it), using the camera's own live right/up vectors so the panel never ends up covering the node it's describing. Selecting a topic also reveals its local "knowledge neighborhood": the selected node becomes prominent, directly related nodes/connections stay clearly visible, and unrelated ones recede. "Back to overview" clears the selection and returns the camera. Orbit/zoom (`OrbitControls`, panning disabled, clamped distance/polar angle) is supplemental, not the primary interaction.

**Accessible HTML controls:** canvas objects aren't keyboard- or screen-reader-reachable, so [`TopicControls.tsx`](app/explore/TopicControls.tsx) renders a real `<button>` per topic below the scene, driving the exact same `onSelect(id)` handler as the 3D nodes and the static fallback's own nodes — there's one selection state, three ways to reach it. `TopicPanel` moves focus to its heading when it opens and returns focus to the triggering button when "Back to overview" is used.

**Reduced-motion and WebGL fallback:** [`useReducedMotion.ts`](app/explore/useReducedMotion.ts) and [`webgl.ts`](app/explore/webgl.ts) each expose a `useSyncExternalStore`-backed hook (reactive to the OS setting changing mid-session; SSR-safe with no hydration mismatch). If reduced motion is on or WebGL is unavailable, [`StaticFallback.tsx`](app/explore/StaticFallback.tsx) renders instead of the Canvas — a real 2D map of the same nodes/edges (HTML + SVG lines), not an error message, and selecting a topic there still opens `TopicPanel` exactly as in 3D. Everything described below (color, glow, ambient elements, breathing) lives entirely inside the Canvas branch, so reduced-motion/no-WebGL users never load or pay for any of it.

**Visual atmosphere — color, glow, depth:** each node's material comes from a small, restrained palette in [`data.ts`](app/explore/data.ts) (`NODE_ACCENTS` — indigo, violet, blue-indigo, muted blue, muted teal; not a rainbow), converging to a shared brighter violet only while selected, so "selected" reads consistently regardless of a node's own hue. [`Glow.tsx`](app/explore/components/Glow.tsx) adds a restrained "fake glow" — a slightly larger, additive-blended, low-opacity copy of a node's own geometry (`raycast={() => null}`, so it never steals hover/click) — with intensity following the same selected → related → normal → unrelated hierarchy as the nodes themselves; Lumora's own glow is the strongest in the scene, alongside a very slow, barely-perceptible emissive "breathing" pulse. [`AmbientField.tsx`](app/explore/components/AmbientField.tsx) scatters a handful of tiny, non-interactive, unlabeled shards/rings well outside the graph's own radius (12 on desktop, 6 on coarse-pointer devices, drifting on independent slow/irregular phases) purely so the wide dark space doesn't read as empty — they carry no data, aren't clickable, and aren't part of the knowledge graph. A subtle `fog` (matching the canvas's own clear color) reinforces depth by fading the farthest geometry very slightly toward the background. None of this uses postprocessing, bloom, particles, or physics.

**Mobile/touch:** the canvas is a responsive `65–70vh` panel (not `100vh`, to avoid fighting mobile browser toolbars); `OrbitControls` support one-finger rotate and pinch-zoom out of the box with panning disabled; node taps and the HTML topic buttons both work at phone width; device pixel ratio is capped lower (`[1, 1.5]` vs. `[1, 2]`) and the ambient field is thinned (6 vs. 12 elements) on coarse-pointer devices via `matchMedia("(pointer: coarse)")`.

**Performance:** 7 knowledge nodes + 1 central node, low-poly procedural geometry (`icosahedronGeometry`/`octahedronGeometry`), no shadows, no postprocessing, no physics, capped DPR. The glow shells and ambient field add only a handful of small extra meshes — the ambient field shares two geometry instances across every element rather than allocating one per object — see [`Scene.tsx`](app/explore/components/Scene.tsx).

**Lazy loading:** `app/explore/page.tsx` is a Server Component with no `three`/`@react-three/*` imports; [`ExploreClient.tsx`](app/explore/ExploreClient.tsx) loads [`Scene.tsx`](app/explore/components/Scene.tsx) via `next/dynamic` with `ssr: false`, so the 3D bundle (confirmed via the build's per-route client-reference manifest to be excluded from every other route, including `/explore`'s own initial HTML) is only fetched by browsers that actually render the Canvas.

**Known non-issue:** the browser console logs a `THREE.Clock: This module has been deprecated` warning during scene interaction. This comes from `@react-three/fiber`'s own internal clock (`state.clock`, the framework-standard way to read elapsed time in `useFrame`), not from application code — an upstream `three`/`@react-three/fiber` version-pairing issue, not something this feature works around.
