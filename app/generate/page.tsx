import ChatInterface from "./ChatInterface";

export default function GeneratePage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-4 px-4 py-8 sm:px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Generate
        </h1>
        <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          Chat with Lumora to explore and understand your topics.
        </p>
      </div>
      <ChatInterface />
    </main>
  );
}
