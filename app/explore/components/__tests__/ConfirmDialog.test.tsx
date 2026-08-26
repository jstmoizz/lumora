import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmDialog from "../ConfirmDialog";

function renderDialog(confirmDisabled?: boolean, onConfirm = vi.fn()) {
  render(
    <ConfirmDialog
      open
      onOpenChange={vi.fn()}
      title="Delete this?"
      description="This can't be undone."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      confirmDisabled={confirmDisabled}
    />,
  );
  return onConfirm;
}

// Both delete and reset thread their own `isPending` through as
// `confirmDisabled`, so Confirm can't fire a second mutation mid-flight.
describe("ConfirmDialog — confirmDisabled", () => {
  test("the Confirm button is enabled by default", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();
  });

  test("confirmDisabled disables the Confirm button", () => {
    renderDialog(true);
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  test("clicking a disabled Confirm button does not call onConfirm", () => {
    const onConfirm = renderDialog(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("Cancel remains enabled and functional while confirmDisabled is true", () => {
    renderDialog(true);
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
  });
});
