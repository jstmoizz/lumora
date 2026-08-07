export default function AboutPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        About
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Learn more about Lumora&apos;s mission to turn notes into knowledge.
      </p>
      <span className="rounded-full border border-zinc-300 px-4 py-1 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-500">
        Coming Soon
      </span>
    </main>
  );
}
