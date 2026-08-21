// Forces per-request rendering. Without this, the page has no dynamic API
// calls left (the external fetch is gone) and Next would prerender it once
// at build time — freezing the GROQ_API_KEY check to whatever was true at
// build time instead of reflecting the server's actual current env.
export const dynamic = "force-dynamic";

// Only reports facts Lumora can actually verify about itself: that this
// page rendered (so the app is up) and whether GROQ_API_KEY is present in
// the server environment. It never contacts an external service and never
// exposes the key's value — only whether it's set.
function isGroqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? "flex items-center gap-2 rounded-full border border-green-300 bg-green-50 px-4 py-1 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
          : "flex items-center gap-2 rounded-full border border-red-300 bg-red-50 px-4 py-1 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
      }
    >
      <span
        className={
          ok
            ? "h-2 w-2 rounded-full bg-green-500"
            : "h-2 w-2 rounded-full bg-red-500"
        }
      />
      {label}
    </span>
  );
}

export default function HealthPage() {
  const groqConfigured = isGroqConfigured();
  const timestamp = new Date().toISOString();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Health
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        What Lumora can verify about its own configuration, right now.
      </p>

      <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            Application
          </span>
          <StatusPill ok label="Operational" />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            AI provider (Groq) API key
          </span>
          <StatusPill
            ok={groqConfigured}
            label={groqConfigured ? "Configured" : "Not configured"}
          />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Server timestamp: <span className="font-mono">{timestamp}</span>
        </p>
      </div>
    </main>
  );
}
