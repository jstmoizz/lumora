import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "../page";

// vitest.setup.ts defaults matchMedia to reduced-motion and canvas.getContext
// to null, so this exercises Home's calmest fallback path (no GSAP, no
// shader, no WebGL) — not a substitute for the live/e2e visual QA the
// shader, SpecularButton shine, and ClickSpark themselves need.
describe("Home", () => {
  // The hero heading (WarpText) is lazily imported (`ssr: false`) to keep
  // `ogl` off the critical path — real, paintable text must exist on the
  // very first synchronous render for LCP, regardless of whether the
  // dynamic import ever resolves.
  //
  // `toHaveTextContent`, not an accessible-name query: WarpText's eventual
  // role="img" + aria-label produces the same computed name as real text
  // would, so only `.textContent` actually distinguishes "real text" from
  // "a placeholder for content that hasn't loaded yet."
  test("renders the hero headline as real DOM text immediately, before the animated version can load", () => {
    render(<Home />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Study Smarter with Lumora.");
    expect(
      screen.queryByRole("img", { name: "Study Smarter with Lumora." }),
    ).not.toBeInTheDocument();
  });

  // jsdom has no WebGL (canvas.getContext is stubbed to null), so WarpText's
  // effect fails fast and is caught internally (see WarpText.test.tsx), but
  // its role="img"/aria-label container still renders regardless.
  test("swaps to the animated WarpText once the dynamic import resolves", async () => {
    render(<Home />);
    // A longer timeout than findByRole's 1000ms default — the dynamic
    // import (WarpText + its ogl dependency graph) resolves well within
    // that locally, but a slower/loaded CI runner can push it past 1000ms
    // with no actual bug involved.
    expect(
      await screen.findByRole(
        "img",
        { name: "Study Smarter with Lumora." },
        { timeout: 5000 },
      ),
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
