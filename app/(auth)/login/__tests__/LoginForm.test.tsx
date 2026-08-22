import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginForm from "../LoginForm";

vi.mock("@/lib/supabase/actions", () => ({
  signIn: vi.fn(),
}));

import { signIn } from "@/lib/supabase/actions";

describe("LoginForm", () => {
  test("renders accessible, labeled email and password fields plus the submit button", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  test("email and password inputs carry the correct autocomplete/type attributes", () => {
    render(<LoginForm />);
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
  });

  test("links to Sign Up and Forgot Password are present", () => {
    render(<LoginForm />);
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  test("carries the redirectTo value through as a hidden field", () => {
    render(<LoginForm redirectTo="/history" />);
    const hidden = document.querySelector(
      'input[name="redirectTo"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("/history");
  });

  test("shows the server-returned error, announced via role=alert", async () => {
    vi.mocked(signIn).mockResolvedValue({ error: "Invalid email or password." });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid email or password.",
      );
    });
  });
});
