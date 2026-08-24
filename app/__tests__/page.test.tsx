import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "../page";

// vitest.setup.ts defaults matchMedia to reduced-motion and canvas.getContext
// to null, so this exercises Home's calmest fallback path throughout (no
// GSAP timelines, no shader, no WebGL) — the same path a reduced-motion
// user, or a browser without WebGL, actually gets. Not a substitute for the
// live/e2e visual QA the shader, SpecularButton shine, and ClickSpark
// themselves need.
describe("Home", () => {
  // The hero heading (WarpText) is now lazily imported (`ssr: false`) to
  // keep `ogl` out of Home's initial bundle and off the critical path to
  // this element — see page.tsx's own comment. This is the behavior that
  // actually matters for LCP: real, paintable text must be present on the
  // very first synchronous render, with no dependency on the dynamic
  // import ever resolving.
  //
  // `toHaveTextContent` (not `getByRole("heading", { name: ... })`) is the
  // meaningful assertion here: an accessible-name query would pass either
  // way, since the eventual WarpText's role="img" + aria-label contributes
  // the exact same computed name to the parent <h1> that real text content
  // would — confirmed by reverting this fix locally and re-running this
  // test file, where a name-based query kept passing but this one failed.
  // `.textContent` only reflects real DOM text nodes, not an aria-label, so
  // it's what actually distinguishes "real text" from "an accessible
  // placeholder for content that hasn't loaded yet."
  test("renders the hero headline as real DOM text immediately, before the animated version can load", () => {
    render(<Home />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Study Smarter with Lumora.");
    expect(
      screen.queryByRole("img", { name: "Study Smarter with Lumora." }),
    ).not.toBeInTheDocument();
  });

  // Proves the lazy-loaded swap itself isn't broken — not just that a
  // fallback exists. jsdom has no WebGL (canvas.getContext is stubbed to
  // return null in vitest.setup.ts), so WarpText's own effect fails fast
  // and is caught internally (see WarpText.test.tsx), but its JSX — the
  // role="img"/aria-label container — renders unconditionally regardless
  // of whether the shader itself could initialize.
  test("swaps to the animated WarpText once the dynamic import resolves", async () => {
    render(<Home />);
    expect(
      await screen.findByRole("img", { name: "Study Smarter with Lumora." }),
    ).toBeInTheDocument();
  });

  test("renders the primary CTA as a link to /generate", () => {
    render(<Home />);
    const ctas = screen.getAllByRole("link", { name: /start (learning|studying)/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/generate");
    }
  });
});
