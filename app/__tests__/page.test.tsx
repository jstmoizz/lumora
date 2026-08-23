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
  test("renders the hero headline as accessible text", () => {
    render(<Home />);
    expect(screen.getByRole("img", { name: "Study Smarter with Lumora." })).toBeInTheDocument();
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
