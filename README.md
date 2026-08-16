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

Lumora's chat route registers one server-side tool with the AI SDK's `streamText`: `createQuiz`. The model decides when to call it (e.g. when the user asks to be quizzed on something) and supplies the quiz content itself as the tool call's arguments; `execute` never makes a further model call of its own — it only validates and normalizes that content.

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

### Client rendering — four lifecycle states

[`app/generate/QuizToolPart.tsx`](app/generate/QuizToolPart.tsx) renders the tool call's message part differently for each state the AI SDK exposes on it (`ToolUIPart`'s `state` field):

| State | What's shown |
|---|---|
| `input-streaming` | A generic skeleton card ("Lumora is preparing a quiz…") — the arguments are still streaming in, so no partial JSON is rendered. |
| `input-available` | A "Building your quiz on *{topic}*…" card — the arguments are fully parsed, `execute` hasn't resolved yet. |
| `output-available` | The real quiz: topic + each question with four clickable answer options. Clicking an option reveals correct/incorrect locally (no persistence, no backend scoring). |
| `output-error` | A designed error card (icon + the thrown error's message) — not raw JSON, not an unhandled exception. |

The chat route also sets `stopWhen: stepCountIs(2)`, so the model gets a turn to comment on the quiz after calling the tool instead of the AI SDK's single-step default ending the turn immediately after the tool call.

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

## 10. Lumora Knowledge Space (`/explore`)

An abstract 3D visualization of how the topics you study relate to each other — a central Lumora element with a handful of knowledge nodes (Artificial Intelligence, Algorithms, Data Structures, Databases, Networks, Software Engineering, Mathematics) connected by thin, low-opacity lines. It exists to make "knowledge relationships" feel like a real, explorable space rather than a list, while staying restrained: dark background, muted indigo/violet, low-poly procedural geometry (no imported 3D models), no physics, no postprocessing, no particle effects.

**Meaningful interaction — hover → select → focus → context:** hovering a node in the 3D scene gives it a subtle scale/emissive response; clicking one sets it as the selected topic, which smoothly moves the camera to focus on it (a gentle position/target lerp over ~700ms via [`CameraRig.tsx`](app/explore/components/CameraRig.tsx), coordinated with drei's `OrbitControls` rather than fighting it), dims the unselected nodes, and opens an HTML [`TopicPanel`](app/explore/TopicPanel.tsx) with the topic's title, a short summary, and its related topics. "Back to overview" clears the selection and returns the camera. Orbit/zoom (`OrbitControls`, panning disabled, clamped distance/polar angle) is supplemental, not the primary interaction.

**Accessible HTML controls:** canvas objects aren't keyboard- or screen-reader-reachable, so [`TopicControls.tsx`](app/explore/TopicControls.tsx) renders a real `<button>` per topic below the scene, driving the exact same `onSelect(id)` handler as the 3D nodes and the static fallback's own nodes — there's one selection state, three ways to reach it. `TopicPanel` moves focus to its heading when it opens and returns focus to the triggering button when "Back to overview" is used.

**Reduced-motion and WebGL fallback:** [`useReducedMotion.ts`](app/explore/useReducedMotion.ts) and [`webgl.ts`](app/explore/webgl.ts) each expose a `useSyncExternalStore`-backed hook (reactive to the OS setting changing mid-session; SSR-safe with no hydration mismatch). If reduced motion is on or WebGL is unavailable, [`StaticFallback.tsx`](app/explore/StaticFallback.tsx) renders instead of the Canvas — a real 2D map of the same nodes/edges (HTML + SVG lines), not an error message, and selecting a topic there still opens `TopicPanel` exactly as in 3D.

**Mobile/touch:** the canvas is a responsive `65–70vh` panel (not `100vh`, to avoid fighting mobile browser toolbars); `OrbitControls` support one-finger rotate and pinch-zoom out of the box with panning disabled; node taps and the HTML topic buttons both work at phone width; device pixel ratio is capped lower (`[1, 1.5]` vs. `[1, 2]`) on coarse-pointer devices via `matchMedia("(pointer: coarse)")`.

**Performance:** 7 knowledge nodes + 1 central node, low-poly procedural geometry (`icosahedronGeometry`/`octahedronGeometry`), no shadows, no postprocessing, no physics, capped DPR — see [`Scene.tsx`](app/explore/components/Scene.tsx).

**Lazy loading:** `app/explore/page.tsx` is a Server Component with no `three`/`@react-three/*` imports; [`ExploreClient.tsx`](app/explore/ExploreClient.tsx) loads [`Scene.tsx`](app/explore/components/Scene.tsx) via `next/dynamic` with `ssr: false`, so the 3D bundle (confirmed via the build's per-route client-reference manifest to be excluded from every other route, including `/explore`'s own initial HTML) is only fetched by browsers that actually render the Canvas.

**Known non-issue:** the browser console logs a `THREE.Clock: This module has been deprecated` warning during scene interaction. This comes from `@react-three/fiber`'s own internal clock (`state.clock`, the framework-standard way to read elapsed time in `useFrame`), not from application code — an upstream `three`/`@react-three/fiber` version-pairing issue, not something this feature works around.
