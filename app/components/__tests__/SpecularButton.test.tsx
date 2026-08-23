import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SpecularButton from "../SpecularButton";

// SpecularButton's own WebGL setup effect fails fast in jsdom (no real
// WebGL context — see vitest.setup.ts) and is caught, so only the plain DOM
// behavior (link/button semantics, disabled state, click handling) is
// covered here — not the shader itself. See the project brief: "Do not
// write brittle tests for visual WebGL output."
describe("SpecularButton", () => {
  test("renders as a real link when href is given", () => {
    render(<SpecularButton href="/generate">Start Learning</SpecularButton>);
    const link = screen.getByRole("link", { name: "Start Learning" });
    expect(link).toHaveAttribute("href", "/generate");
  });

  test("renders as a native button when no href is given", () => {
    render(<SpecularButton>Get Started</SpecularButton>);
    expect(screen.getByRole("button", { name: "Get Started" })).toHaveAttribute("type", "button");
  });

  test("fires onClick for the plain-button variant", () => {
    const onClick = vi.fn();
    render(<SpecularButton onClick={onClick}>Get Started</SpecularButton>);
    fireEvent.click(screen.getByRole("button", { name: "Get Started" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("disabled button variant does not fire onClick and is a real disabled button", () => {
    const onClick = vi.fn();
    render(
      <SpecularButton disabled onClick={onClick}>
        Get Started
      </SpecularButton>,
    );
    const button = screen.getByRole("button", { name: "Get Started" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("disabled link variant is marked aria-disabled, unreachable by tab, and swallows clicks", () => {
    const onClick = vi.fn();
    render(
      <SpecularButton href="/generate" disabled onClick={onClick}>
        Start Learning
      </SpecularButton>,
    );
    const link = screen.getByRole("link", { name: "Start Learning" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("tabIndex", "-1");
    fireEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });
});
