import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RecentPromptsPanel from "../RecentPromptsPanel";

describe("RecentPromptsPanel empty state", () => {
  test("shows a clean empty state when there are no prompts yet", () => {
    render(<RecentPromptsPanel prompts={[]} onSelect={vi.fn()} />);
    expect(
      screen.getByText("Prompts you send will show up here."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("RecentPromptsPanel with prompts", () => {
  test("renders each prompt as a keyboard-reachable button, in the given order", () => {
    render(
      <RecentPromptsPanel
        prompts={["Quiz me on cell biology", "Explain osmosis"]}
        onSelect={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent("Quiz me on cell biology");
    expect(buttons[1]).toHaveTextContent("Explain osmosis");
    // A plain <button> is a native, tab-focusable element — no explicit
    // tabIndex is needed for keyboard reachability.
    expect(buttons[0].tagName).toBe("BUTTON");
  });

  test("clicking a prompt calls onSelect with its exact text", () => {
    const onSelect = vi.fn();
    render(
      <RecentPromptsPanel
        prompts={["Quiz me on cell biology"]}
        onSelect={onSelect}
      />,
    );

    screen.getByRole("button", { name: "Quiz me on cell biology" }).click();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("Quiz me on cell biology");
  });
});
