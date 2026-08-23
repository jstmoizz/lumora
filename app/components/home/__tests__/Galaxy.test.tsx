import { describe, test, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import Galaxy from "../Galaxy";

// jsdom implements neither ResizeObserver nor IntersectionObserver — R3F's
// <Canvas> (via react-use-measure) throws synchronously without the
// former, and useElementVisible needs the latter. Stubbed locally (not in
// vitest.setup.ts) since this is the only component in the suite that
// mounts a real R3F <Canvas> directly rather than going through
// HeroShaderBackground's reduced-motion/no-WebGL gate.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", StubObserver);
vi.stubGlobal("IntersectionObserver", StubObserver);

describe("Galaxy", () => {
  test("mounts without crashing when WebGL is unavailable", () => {
    expect(() => render(<Galaxy />)).not.toThrow();
  });
});
