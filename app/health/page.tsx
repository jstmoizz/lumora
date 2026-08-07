async function getHealthCheck() {
  try {
    const res = await fetch("https://dummyjson.com/test", {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    return { ok: true as const, data: await res.json() };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export default async function HealthPage() {
  const result = await getHealthCheck();
  const timestamp = new Date().toISOString();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Health
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Check the current status and health of Lumora&apos;s services.
      </p>

      <span
        className={
          result.ok
            ? "flex items-center gap-2 rounded-full border border-green-300 bg-green-50 px-4 py-1 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
            : "flex items-center gap-2 rounded-full border border-red-300 bg-red-50 px-4 py-1 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
        }
      >
        <span
          className={
            result.ok
              ? "h-2 w-2 rounded-full bg-green-500"
              : "h-2 w-2 rounded-full bg-red-500"
          }
        />
        {result.ok ? "Operational" : "Unavailable"}
      </span>

      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-2 text-zinc-500 dark:text-zinc-500">
          Server timestamp: <span className="font-mono">{timestamp}</span>
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-zinc-700 dark:text-zinc-300">
          {result.ok
            ? JSON.stringify(result.data, null, 2)
            : `Error: ${result.error}`}
        </pre>
      </div>
    </main>
  );
}
