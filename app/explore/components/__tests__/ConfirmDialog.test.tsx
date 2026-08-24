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

// M7: the shared confirmation step for Explore's two destructive flows
// (delete a topic, reset the graph) — both now thread their own `isPending`
// through as `confirmDisabled` so the same Confirm button this dialog
// renders can't fire a second mutation while the first is still in flight.
describe("ConfirmDialog — confirmDisabled (M7)", () => {
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
