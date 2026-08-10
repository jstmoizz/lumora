import Link from "next/link";

export default function TabsPlaygroundPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Tabs
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Not yet implemented.
      </p>
      <Link
        href="/playground"
        className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        Back to playground
      </Link>
    </main>
  );
}
