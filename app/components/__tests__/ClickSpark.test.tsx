import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ClickSpark from "../ClickSpark";

// vitest.setup.ts stubs matchMedia to always report matches: true, so
// prefers-reduced-motion reads as "reduce" by default in every test here —
// exactly the case this suite needs for its default-state assertions.
function mockPrefersReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  mockPrefersReducedMotion(true);
});

describe("ClickSpark", () => {
  test("renders its children unchanged", () => {
    render(
      <ClickSpark>
        <button>Click me</button>
      </ClickSpark>,
    );
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  test("does not interfere with a child button's own click handler", () => {
    const onClick = vi.fn();
    render(
      <ClickSpark>
        <button onClick={onClick}>Click me</button>
      </ClickSpark>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Click me" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("under prefers-reduced-motion, renders no canvas at all", () => {
    mockPrefersReducedMotion(true);
    render(
      <ClickSpark>
        <p>content</p>
      </ClickSpark>,
    );
    expect(document.querySelector("canvas")).not.toBeInTheDocument();
  });

  test("without reduced motion, mounts a pointer-events-none, aria-hidden canvas", () => {
    mockPrefersReducedMotion(false);
    render(
      <ClickSpark>
        <p>content</p>
      </ClickSpark>,
    );
    const canvas = document.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("pointer-events-none");
  });
});
