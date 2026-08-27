import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "../page";

// vitest.setup.ts defaults matchMedia to reduced-motion and canvas.getContext
// to null, so this exercises Home's calmest fallback path (no GSAP, no
// shader, no WebGL) — not a substitute for the live/e2e visual QA the
// shader, SpecularButton shine, and ClickSpark themselves need.
describe("Home", () => {
  // vitest.setup.ts's matchMedia stub always matches, so useReducedMotion()
  // is true here — the same "reduced motion: show the fallback immediately"
  // path a real reduced-motion user hits. That makes HeroHeadlineFallback
  // the active, accessible layer; WarpText's role="img" container still
  // renders (it's a plain static import, not next/dynamic — see page.tsx's
  // comment), but sits under aria-hidden so the headline isn't announced
  // twice — see WarpText.test.tsx for WarpText's own canvas-less behavior.
  test("renders the hero headline as real, accessible DOM text with no duplicate accessible name", () => {
    render(<Home />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Study Smarter with Lumora.");
    expect(
      screen.queryByRole("img", { name: "Study Smarter with Lumora." }),
    ).not.toBeInTheDocument();
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
