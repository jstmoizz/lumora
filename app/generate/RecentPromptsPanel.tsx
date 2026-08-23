"use client";

import { HistoryIcon } from "lucide-react";

interface RecentPromptsPanelProps {
  prompts: string[];
  onSelect: (prompt: string) => void;
}

// Deliberately simple, per the brief: a flat list of recently submitted
// prompt strings (newest first — GenerateWorkspace maintains that order,
// this component just renders whatever it's given), not a conversation
// manager. Clicking a prompt re-sends it through the exact same path a
// freshly typed message takes (see GenerateWorkspace's `pendingPrompt`
// wiring into ChatInterface).
export default function RecentPromptsPanel({
  prompts,
  onSelect,
}: RecentPromptsPanelProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Recent Prompts
      </h2>

      {prompts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <div
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-lg bg-secondary text-foreground"
          >
            <HistoryIcon className="size-4" />
          </div>
          <p className="max-w-[20ch] text-xs text-muted-foreground">
            Prompts you send will show up here.
          </p>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {prompts.map((prompt) => (
            <li key={prompt}>
              <button
                type="button"
                title={prompt}
                onClick={() => onSelect(prompt)}
                className="w-full truncate rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors duration-150 ease-out hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {prompt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
