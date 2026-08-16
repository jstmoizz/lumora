import type { Metadata } from "next";
import ExploreClient from "./ExploreClient";

export const metadata: Metadata = {
  title: "Explore — Lumora",
  description:
    "Explore Lumora's knowledge space: an abstract 3D view of how the topics you study connect.",
};

export default function ExplorePage() {
  return (
    <main className="flex flex-1 flex-col px-6 py-12 sm:py-16">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Explore your knowledge space
          </h1>
          <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Every topic here connects back to Lumora. Select one to see how it
            fits.
          </p>
        </div>
        <ExploreClient />
      </div>
    </main>
  );
}
