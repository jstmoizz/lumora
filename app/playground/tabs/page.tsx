import Link from "next/link";
import Tabs from "./Tabs";

export default function TabsPlaygroundPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Tabs
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        W3C APG Tabs pattern example. Click a tab, or focus the tablist and
        use Left/Right, Home, and End to move between tabs.
      </p>
      <Tabs
        label="Note view"
        tabs={[
          {
            id: "notes",
            label: "Notes",
            content:
              "Your raw notes live here, exactly as you wrote them, before any processing.",
          },
          {
            id: "summary",
            label: "Summary",
            content:
              "Lumora condenses your notes into a short summary you can scan in seconds.",
          },
          {
            id: "tags",
            label: "Tags",
            content:
              "Automatically extracted topics and keywords help you find this note again later.",
          },
        ]}
      />
      <Link
        href="/playground"
        className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        Back to playground
      </Link>
    </main>
  );
}
