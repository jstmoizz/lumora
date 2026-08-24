import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  // Same race already found and fixed for Explore's delete/reset confirms
  // and Generate's composer/example prompts: `isPending`/`current` are
  // React state, which only reflects a click once a render has happened.
  // The existing "a second click while a save is pending" test above
  // deliberately waits for the button to become disabled before its second
  // click, so it can't catch this — both clicks need to land inside one
  // `act()` block so neither gets a commit in between (see
  // ChatInterface.test.tsx's identical composer test for the full
  // rationale on why two separate `fireEvent.click()` calls prove nothing
  // here).
  test("a rapid double-click on two different options (before React can re-render) calls updateUserSetting exactly once", async () => {
    let resolveUpdate!: (value: { error: string | null }) => void;
    vi.mocked(updateUserSetting).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    render(<SettingsClient account={null} preferences={preferences} />);

    const group = responseStyleGroup();
    const detailedButton = within(group).getByRole("button", { name: "Detailed" });
    const conversationalButton = within(group).getByRole("button", {
      name: "Conversational",
    });

    act(() => {
      fireEvent.click(detailedButton);
      fireEvent.click(conversationalButton);
    });

    expect(updateUserSetting).toHaveBeenCalledTimes(1);

    // `updateUserSetting` is one shared mock reused by every test in this
    // file (unlike ChatInterface.test.tsx's per-test `sendMessage`), so a
    // promise resolved without awaiting its flush here would have its
    // continuation (the `finally` that clears `isSavingRef`) run on a later
    // microtask that can bleed into whichever test happens to run next —
    // fully flushing it inside `act()` before this test ends avoids that.
    await act(async () => {
      resolveUpdate({ error: null });
    });
  });

  test("the guard releases once a save settles, so a later legitimate selection still saves", async () => {
    let resolveUpdate!: (value: { error: string | null }) => void;
    vi.mocked(updateUserSetting).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    render(<SettingsClient account={null} preferences={preferences} />);

    const group = responseStyleGroup();
    fireEvent.click(within(group).getByRole("button", { name: "Detailed" }));
    expect(updateUserSetting).toHaveBeenCalledTimes(1);

    // Let the first save's promise settle, so its `finally` block (the
    // only place `isSavingRef` is cleared) actually runs.
    await act(async () => {
      resolveUpdate({ error: null });
    });

    fireEvent.click(within(group).getByRole("button", { name: "Conversational" }));

    expect(updateUserSetting).toHaveBeenCalledTimes(2);
    expect(updateUserSetting).toHaveBeenLastCalledWith(
      "response_style",
      "Conversational",
    );

    // `updateUserSetting` is one shared mock reused by every test in this
    // file — an unresolved transition left dangling here (the second
    // click's promise) doesn't just leak in this test, it's been observed
    // to stall unrelated *later* tests' own saves, since `useTransition`'s
    // underlying scheduler is a process-wide singleton, not reset between
    // tests. Always fully settle every promise this mock hands out before
    // a test using it ends.
    await act(async () => {
      resolveUpdate({ error: null });
    });
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

  test("the theme guard releases once a save settles, so a later legitimate selection still saves", async () => {
    let resolveUpdate!: (value: { error: string | null }) => void;
    vi.mocked(updateUserSetting).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    render(<SettingsClient account={null} preferences={preferences} />);

    const group = screen.getByRole("group", { name: "Appearance" });
    fireEvent.click(within(group).getByRole("button", { name: "Dark" }));
    expect(updateUserSetting).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpdate({ error: null });
    });

    fireEvent.click(within(group).getByRole("button", { name: "Light" }));

    expect(updateUserSetting).toHaveBeenCalledTimes(2);
    expect(updateUserSetting).toHaveBeenLastCalledWith("theme", "light");

    // See the Study Preferences version of this test for why the second
    // click's promise needs to be fully settled here too.
    await act(async () => {
      resolveUpdate({ error: null });
    });
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

  // Same race and same technique as the Study Preferences version above,
  // applied to AppearanceRow's own separate `isSavingRef`.
  test("a rapid double-click on two different theme options (before React can re-render) calls updateUserSetting exactly once", async () => {
    let resolveUpdate!: (value: { error: string | null }) => void;
    vi.mocked(updateUserSetting).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    render(<SettingsClient account={null} preferences={preferences} />);

    const group = screen.getByRole("group", { name: "Appearance" });
    const darkButton = within(group).getByRole("button", { name: "Dark" });
    const lightButton = within(group).getByRole("button", { name: "Light" });

    act(() => {
      fireEvent.click(darkButton);
      fireEvent.click(lightButton);
    });

    expect(updateUserSetting).toHaveBeenCalledTimes(1);

    // See the Study Preferences version of this test for why the resolution
    // needs to be fully flushed here rather than fired and forgotten.
    await act(async () => {
      resolveUpdate({ error: null });
    });
  });

  test("a fresh browser with no local theme choice pulls in the persisted value", () => {
    // No localStorage key at all — the cross-device bootstrap case: this
    // account already has a saved preference from another browser/device.
    render(<SettingsClient account={null} preferences={preferences} />);

    // preferences.theme is "system" — nothing local to conflict with it.
    expect(window.localStorage.getItem("lumora-theme")).toBe("system");
  });

  // Regression test for the "theme reverts to dark when navigating between
  // pages" bug: this component's reconciliation effect used to overwrite
  // ANY mismatch between localStorage and the server-fetched `initialTheme`
  // in the database's favor — but `initialTheme` falls back to "system"
  // whenever nothing's been persisted for this account yet (see
  // `preferences.theme` below), which isn't actually more authoritative
  // than a real explicit choice already sitting in localStorage. A browser
  // that has already made a local choice must keep it.
  test("does not overwrite an existing local theme choice, even if it differs from the persisted value", () => {
    window.localStorage.setItem("lumora-theme", "dark");
    document.documentElement.classList.add("dark");

    render(<SettingsClient account={null} preferences={preferences} />);

    // preferences.theme is "system" here — the local "dark" choice must
    // win, not get silently reset back to "system".
    expect(window.localStorage.getItem("lumora-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
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

// Radix's DropdownMenuTrigger opens on `pointerdown`, not `click` — a plain
// fireEvent.click() (a bare "click" DOM event, unlike a real click which a
// browser precedes with pointerdown/mousedown) never reaches that handler,
// so the menu never opens under jsdom without this.
function openGenerateAccentMenu() {
  const trigger = screen.getByRole("button", { name: /^Generate accent:/ });
  fireEvent.pointerDown(trigger, { button: 0, pointerId: 1, isPrimary: true });
  fireEvent.click(trigger);
}

describe("SettingsClient — Generate accent", () => {
  test("defaults to Indigo when nothing is stored", () => {
    render(<SettingsClient account={null} preferences={preferences} />);

    expect(
      screen.getByRole("button", {
        name: "Generate accent: Indigo. Change accent.",
      }),
    ).toBeInTheDocument();
  });

  test("reflects a previously stored accent on mount", () => {
    window.localStorage.setItem("lumora-generate-accent", "pink");

    render(<SettingsClient account={null} preferences={preferences} />);

    expect(
      screen.getByRole("button", {
        name: "Generate accent: Pink. Change accent.",
      }),
    ).toBeInTheDocument();
  });

  test("selecting an accent applies it instantly, persists it, and exposes the selected state accessibly", async () => {
    render(<SettingsClient account={null} preferences={preferences} />);

    openGenerateAccentMenu();

    const pinkOption = await screen.findByRole("menuitemradio", {
      name: "Pink",
    });
    expect(pinkOption).toHaveAttribute("aria-checked", "false");
    fireEvent.click(pinkOption);

    expect(window.localStorage.getItem("lumora-generate-accent")).toBe(
      "pink",
    );
    expect(
      screen.getByRole("button", {
        name: "Generate accent: Pink. Change accent.",
      }),
    ).toBeInTheDocument();
  });

  test("does not touch the global theme's storage key or DOM class", async () => {
    render(<SettingsClient account={null} preferences={preferences} />);
    // AppearanceRow's own bootstrap effect legitimately writes the server's
    // initialTheme ("system" here) on mount — capture that baseline first,
    // so this only asserts the Generate accent selection itself never
    // changes it any further.
    const themeBeforeAccentChange = window.localStorage.getItem("lumora-theme");
    const darkBeforeAccentChange = document.documentElement.classList.contains("dark");
    const lightBeforeAccentChange = document.documentElement.classList.contains("light");

    openGenerateAccentMenu();
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Green" }));

    expect(window.localStorage.getItem("lumora-theme")).toBe(themeBeforeAccentChange);
    expect(document.documentElement.classList.contains("dark")).toBe(darkBeforeAccentChange);
    expect(document.documentElement.classList.contains("light")).toBe(lightBeforeAccentChange);
  });
});
