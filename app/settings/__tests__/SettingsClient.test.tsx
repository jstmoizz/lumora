import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SettingsClient from "../SettingsClient";

vi.mock("@/lib/supabase/settings-actions", () => ({
  updateUserSetting: vi.fn(),
}));

import { updateUserSetting } from "@/lib/supabase/settings-actions";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.classList.remove("light", "dark");
});

const preferences = {
  theme: "system" as const,
  responseStyle: "Clear and concise",
  explanationDepth: "Detailed",
  learningFocus: "General",
  updatedAt: "2026-01-01T00:00:00Z",
};

function responseStyleGroup() {
  return screen.getByRole("group", { name: "Response style" });
}

describe("SettingsClient — Study Preferences", () => {
  test("renders the real persisted values, not hardcoded placeholders", () => {
    render(<SettingsClient account={null} preferences={preferences} />);

    expect(
      responseStyleGroup().querySelector('[aria-current="true"]'),
    ).toHaveTextContent("Clear and concise");
  });

  test("shows a fallback message instead of crashing when preferences failed to load", () => {
    render(<SettingsClient account={null} preferences={null} />);

    expect(
      screen.getByText(/Couldn't load your study preferences/),
    ).toBeInTheDocument();
  });

  test("selecting a different option saves it and shows a real confirmation", async () => {
    vi.mocked(updateUserSetting).mockResolvedValue({ error: null });
    render(<SettingsClient account={null} preferences={preferences} />);

    const group = responseStyleGroup();
    fireEvent.click(within(group).getByRole("button", { name: "Detailed" }));

    expect(updateUserSetting).toHaveBeenCalledWith(
      "response_style",
      "Detailed",
    );

    await waitFor(() => {
      expect(
        within(group.parentElement!).getByText("Saved"),
      ).toBeInTheDocument();
    });
    expect(group.querySelector('[aria-current="true"]')).toHaveTextContent(
      "Detailed",
    );
  });

  test("shows Saving while the update is in flight, and disables the options", async () => {
    let resolveUpdate!: (value: { error: string | null }) => void;
    vi.mocked(updateUserSetting).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    render(<SettingsClient account={null} preferences={preferences} />);

    const group = responseStyleGroup();
    fireEvent.click(within(group).getByRole("button", { name: "Detailed" }));

    await waitFor(() => {
      expect(within(group.parentElement!).getByText("Saving…")).toBeInTheDocument();
    });
    expect(
      within(group).getByRole("button", { name: "Detailed" }),
    ).toBeDisabled();
    expect(
      within(group).getByRole("button", { name: "Clear and concise" }),
    ).toBeDisabled();

    resolveUpdate({ error: null });
    await waitFor(() => {
      expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    });
  });

  test("a second click while a save is pending does not trigger a second call", async () => {
    let resolveUpdate!: (value: { error: string | null }) => void;
    vi.mocked(updateUserSetting).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    render(<SettingsClient account={null} preferences={preferences} />);

    const group = responseStyleGroup();
    fireEvent.click(within(group).getByRole("button", { name: "Detailed" }));
    await waitFor(() => {
      expect(
        within(group).getByRole("button", { name: "Detailed" }),
      ).toBeDisabled();
    });
    fireEvent.click(
      within(group).getByRole("button", { name: "Conversational" }),
    );

    expect(updateUserSetting).toHaveBeenCalledTimes(1);
    resolveUpdate({ error: null });
  });

  test("clicking the already-selected option does not call updateUserSetting at all", () => {
    render(<SettingsClient account={null} preferences={preferences} />);

    fireEvent.click(
      within(responseStyleGroup()).getByRole("button", {
        name: "Clear and concise",
      }),
    );

    expect(updateUserSetting).not.toHaveBeenCalled();
  });

  test("shows an error and keeps the original selection when the save fails", async () => {
    vi.mocked(updateUserSetting).mockResolvedValue({
      error: "Couldn't save that change. Please try again.",
    });
    render(<SettingsClient account={null} preferences={preferences} />);

    const group = responseStyleGroup();
    fireEvent.click(within(group).getByRole("button", { name: "Detailed" }));

    await waitFor(() => {
      expect(
        within(group.parentElement!).getByText(
          "Couldn't save that change. Please try again.",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(group.querySelector('[aria-current="true"]')).toHaveTextContent(
      "Clear and concise",
    );
  });

  test("renders the persisted theme as the active Appearance option", () => {
    render(<SettingsClient account={null} preferences={preferences} />);

    const group = screen.getByRole("group", { name: "Appearance" });
    expect(group.querySelector('[aria-current="true"]')).toHaveTextContent(
      "System",
    );
  });

  test("selecting a theme applies it instantly and persists it", async () => {
    vi.mocked(updateUserSetting).mockResolvedValue({ error: null });
    render(<SettingsClient account={null} preferences={preferences} />);

    const group = screen.getByRole("group", { name: "Appearance" });
    fireEvent.click(within(group).getByRole("button", { name: "Dark" }));

    // Applied locally without waiting on the server round trip.
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(updateUserSetting).toHaveBeenCalledWith("theme", "dark");

    await waitFor(() => {
      expect(
        within(group.parentElement!).getByText("Saved"),
      ).toBeInTheDocument();
    });
    expect(group.querySelector('[aria-current="true"]')).toHaveTextContent(
      "Dark",
    );
  });

  test("a failed theme save keeps the theme applied but shows an error", async () => {
    vi.mocked(updateUserSetting).mockResolvedValue({
      error: "Couldn't save that change. Please try again.",
    });
    render(<SettingsClient account={null} preferences={preferences} />);

    const group = screen.getByRole("group", { name: "Appearance" });
    fireEvent.click(within(group).getByRole("button", { name: "Light" }));

    expect(document.documentElement.classList.contains("light")).toBe(true);
    await waitFor(() => {
      expect(
        within(group.parentElement!).getByText(
          "Couldn't save that change. Please try again.",
        ),
      ).toBeInTheDocument();
    });
  });

  test("reconciles a mismatched local theme to the persisted value on load", () => {
    window.localStorage.setItem("lumora-theme", "dark");
    document.documentElement.classList.add("dark");

    render(<SettingsClient account={null} preferences={preferences} />);

    // preferences.theme is "system" — the persisted value should win over
    // whatever this browser had stored locally.
    expect(window.localStorage.getItem("lumora-theme")).toBe("system");
  });

  test("each preference row is independent", async () => {
    vi.mocked(updateUserSetting).mockResolvedValue({ error: null });
    render(<SettingsClient account={null} preferences={preferences} />);

    const explanationDepthGroup = screen.getByRole("group", {
      name: "Explanation depth",
    });
    fireEvent.click(
      within(explanationDepthGroup).getByRole("button", { name: "In-depth" }),
    );

    await waitFor(() => {
      expect(updateUserSetting).toHaveBeenCalledWith(
        "explanation_depth",
        "In-depth",
      );
    });

    expect(
      responseStyleGroup().querySelector('[aria-current="true"]'),
    ).toHaveTextContent("Clear and concise");
  });
});
