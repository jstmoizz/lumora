import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import OptionWheel from "../OptionWheel";

describe("OptionWheel", () => {
  test("renders every item as a listbox option", () => {
    render(<OptionWheel items={["Neural Networks", "Transformers"]} onChange={vi.fn()} />);

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Neural Networks" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Transformers" })).toBeInTheDocument();
  });

  test("shows a quiet placeholder instead of an empty listbox when there are no items", () => {
    render(<OptionWheel items={[]} onChange={vi.fn()} />);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText(/Study a topic to start unlocking/)).toBeInTheDocument();
  });

  test("clicking an option fires onChange with its index and label", () => {
    const onChange = vi.fn();
    render(<OptionWheel items={["Neural Networks", "Transformers"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("option", { name: "Transformers" }));

    expect(onChange).toHaveBeenCalledWith(1, "Transformers");
  });

  test("marks the item at defaultSelected as aria-selected", () => {
    render(
      <OptionWheel
        items={["Neural Networks", "Transformers"]}
        defaultSelected={1}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: "Neural Networks" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("option", { name: "Transformers" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // Keyboard navigation is handled on the listbox container itself (roving
  // virtual focus, not per-item DOM focus) — matches the ported component's
  // actual interaction model, not a per-item roving-tabindex pattern.
  test("ArrowDown on the listbox moves the selection to the next item", () => {
    const onChange = vi.fn();
    render(
      <OptionWheel items={["Neural Networks", "Transformers", "CNNs"]} onChange={onChange} />,
    );

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });

    expect(onChange).toHaveBeenCalledWith(1, "Transformers");
  });

  test("ArrowUp does not move past the first item when loop is false", () => {
    const onChange = vi.fn();
    render(
      <OptionWheel
        items={["Neural Networks", "Transformers"]}
        onChange={onChange}
        loop={false}
      />,
    );

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowUp" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Neural Networks" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("ArrowUp wraps to the last item when loop is true", () => {
    const onChange = vi.fn();
    render(<OptionWheel items={["Neural Networks", "Transformers"]} onChange={onChange} loop />);

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowUp" });

    expect(onChange).toHaveBeenCalledWith(1, "Transformers");
  });

  test("clicking the already-selected item does not re-fire onChange", () => {
    const onChange = vi.fn();
    render(
      <OptionWheel
        items={["Neural Networks", "Transformers"]}
        defaultSelected={0}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("option", { name: "Neural Networks" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
