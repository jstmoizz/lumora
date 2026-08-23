import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WarpText from "../WarpText";

// WarpText's own WebGL setup effect fails fast and is caught in jsdom (no
// real WebGL context — see vitest.setup.ts), so this only covers the
// accessible text representation, not the shader itself.
describe("WarpText", () => {
  test("exposes the headline as accessible text via role=img + aria-label", () => {
    render(<WarpText text="Study Smarter with Lumora." />);
    expect(screen.getByRole("img", { name: "Study Smarter with Lumora." })).toBeInTheDocument();
  });

  test("renders without crashing when WebGL is unavailable", () => {
    expect(() => render(<WarpText text="Bend the moment" />)).not.toThrow();
  });
});
