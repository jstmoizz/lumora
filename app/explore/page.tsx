import type { Metadata } from "next";
import ExploreClient from "./ExploreClient";
import { getKnowledgeGraph, getKnowledgeNodePositions } from "@/lib/supabase/knowledge-graph";

export const metadata: Metadata = {
  title: "Explore — Lumora",
  description:
    "Your personal knowledge graph: the topics you've studied with Lumora, how they connect, and what to explore next.",
};

export default async function ExplorePage() {
  const [nodes, positions] = await Promise.all([
    getKnowledgeGraph(),
    getKnowledgeNodePositions(),
  ]);

  return (
    // A fixed-height workspace, not a scrolling page — same convention as
    // /generate. Only the Topics list scrolls on its own.
    <main className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 pb-24 sm:px-6">
      <div className="flex shrink-0 flex-col items-center gap-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Your knowledge universe
        </h1>
        <p className="max-w-md text-xs text-muted-foreground sm:text-sm">
          Every topic you study with Lumora grows this graph. Select a node
          to see how it fits, or study something new to keep it growing.
        </p>
      </div>
      <ExploreClient nodes={nodes} positions={positions} />
    </main>
  );
}
