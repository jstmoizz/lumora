import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SignupForm from "../SignupForm";

vi.mock("@/lib/supabase/actions", () => ({
  signUp: vi.fn(),
}));

import { signUp } from "@/lib/supabase/actions";

describe("SignupForm", () => {
  test("renders accessible, labeled email/password/confirm-password fields plus the submit button", () => {
    render(<SignupForm />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
  });

  test("password fields use new-password autocomplete, not current-password", () => {
    render(<SignupForm />);
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  test("shows the server-returned error for a password mismatch, announced via role=alert", async () => {
    vi.mocked(signUp).mockResolvedValue({ error: "Passwords don't match." });
    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse-1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Passwords don't match.");
    });
  });

  test("shows the server-returned error for an existing account", async () => {
    vi.mocked(signUp).mockResolvedValue({
      error: "An account with this email already exists. Try signing in instead.",
    });
    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse-1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "correct-horse-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("already exists");
    });
  });
});
