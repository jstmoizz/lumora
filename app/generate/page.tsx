import ChatInterface from "./ChatInterface";

export default function GeneratePage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center gap-3 px-4 py-6 sm:px-6">
      <h1 className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        Study with Lumora
      </h1>
      <ChatInterface />
    </main>
  );
}
