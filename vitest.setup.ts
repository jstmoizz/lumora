import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Vitest doesn't expose `afterEach` as a global here (test.globals is off),
// so React Testing Library's own auto-cleanup never registers — without
// this, every test in a file keeps rendering into the same document body.
afterEach(() => {
  cleanup();
});

// jsdom has no scroll layout engine and doesn't implement Element.scrollTo.
// ChatInterface's auto-follow effect calls it on every `messages` change.
Element.prototype.scrollTo = vi.fn();

// jsdom does not implement matchMedia. Components in this app gate GSAP
// animations behind `prefers-reduced-motion`, so defaulting `matches: true`
// here skips those animations in tests rather than letting GSAP touch
// layout APIs jsdom doesn't implement.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom does not implement canvas.getContext and logs a console warning
// every time it's called. ExploreClient's WebGL capability check calls it
// on every render, so stub it to return null quietly — this keeps
// `useWebglSupported()` false in tests (routing to StaticFallback), which
// jsdom's real behavior already implies, just without the log noise.
HTMLCanvasElement.prototype.getContext = vi.fn(
  () => null,
) as unknown as typeof HTMLCanvasElement.prototype.getContext;
