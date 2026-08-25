import { describe, test, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import ProfileCard from "../ProfileCard";

// vitest.setup.ts stubs matchMedia to `matches: true` (reduced motion on)
// by default. Tests that need the animated path override it per-test.
function setReducedMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// requestAnimationFrame isn't deterministic in jsdom — this queue lets a
// test flush frames on demand and check whether a new one gets scheduled,
// which is exactly what distinguishes "loop stopped" from "loop kept going."
function mockRaf() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, cb);
    return id;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) => {
    callbacks.delete(id);
  }) as typeof window.cancelAnimationFrame;
  return {
    pendingCount: () => callbacks.size,
    flush: (ts: number) => {
      const pending = Array.from(callbacks.values());
      callbacks.clear();
      for (const cb of pending) cb(ts);
    },
  };
}

const AVATAR_URL = "/about/developer-photo.png";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProfileCard", () => {
  test("renders without throwing under reduced motion (default test environment)", () => {
    setReducedMotion(true);
    const { container } = render(<ProfileCard avatarUrl={AVATAR_URL} name="Test" />);
    expect(container.querySelector(".pc-card-shell")).not.toBeNull();
  });

  test("reduced motion: never starts the animation loop", () => {
    setReducedMotion(true);
    const raf = mockRaf();
    render(<ProfileCard avatarUrl={AVATAR_URL} name="Test" />);
    expect(raf.pendingCount()).toBe(0);
  });

  test("motion allowed: mounting starts the entrance animation", () => {
    setReducedMotion(false);
    const raf = mockRaf();
    render(<ProfileCard avatarUrl={AVATAR_URL} name="Test" />);
    expect(raf.pendingCount()).toBeGreaterThan(0);
  });

  test("the animation loop stops once settled, even while the document has focus", () => {
    // The bug this regression-tests only manifests when document.hasFocus()
    // is true (jsdom defaults to false, which would mask it) — this is the
    // real-world condition (an actual focused browser tab) that caused the
    // loop to never stop in production.
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    setReducedMotion(false);
    const raf = mockRaf();
    render(<ProfileCard avatarUrl={AVATAR_URL} name="Test" />);

    expect(raf.pendingCount()).toBeGreaterThan(0);
    raf.flush(1000); // establishes the loop's internal lastTs, no movement yet
    expect(raf.pendingCount()).toBeGreaterThan(0);
    raf.flush(100000); // huge dt relative to the easing time constant: converges essentially exactly

    expect(raf.pendingCount()).toBe(0);
  });

  test("pointer interaction does not throw", () => {
    setReducedMotion(false);
    mockRaf();
    const { container } = render(<ProfileCard avatarUrl={AVATAR_URL} name="Test" />);
    const shell = container.querySelector(".pc-card-shell") as HTMLElement;

    expect(() => {
      shell.dispatchEvent(
        new window.PointerEvent("pointerenter", { clientX: 10, clientY: 10, bubbles: true }),
      );
      shell.dispatchEvent(
        new window.PointerEvent("pointermove", { clientX: 20, clientY: 15, bubbles: true }),
      );
      shell.dispatchEvent(new window.PointerEvent("pointerleave", { bubbles: true }));
    }).not.toThrow();
  });

  test("unmounting cancels any in-flight animation frame", () => {
    setReducedMotion(false);
    const raf = mockRaf();
    const { unmount } = render(<ProfileCard avatarUrl={AVATAR_URL} name="Test" />);

    expect(raf.pendingCount()).toBeGreaterThan(0);
    unmount();
    expect(raf.pendingCount()).toBe(0);
  });
});
