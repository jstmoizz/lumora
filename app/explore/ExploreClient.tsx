"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import ScenePlaceholder from "./ScenePlaceholder";
import StaticFallback from "./StaticFallback";
import TopicPanel, { type RelatedItem } from "./TopicPanel";
import OptionWheel from "./components/OptionWheel";
import ConfirmDialog from "./components/ConfirmDialog";
import ResetGraphControl from "./components/ResetGraphControl";
import type { KnowledgeGraphNode } from "./data";
import { levelForNodeCount } from "./levels";
import { useReducedMotion } from "./useReducedMotion";
import { useWebglSupported } from "./webgl";
import { deleteKnowledgeNode } from "@/lib/supabase/knowledge-graph-actions";
import { normalizeTopicKey } from "@/lib/knowledge-graph/topics";

// Keeps three/@react-three/* entirely out of every bundle except the one
// that actually renders this scene, and out of the server-rendered HTML.
const Scene = dynamic(() => import("./components/Scene"), {
  ssr: false,
  loading: () => <ScenePlaceholder />,
});

interface ExploreClientProps {
  nodes: KnowledgeGraphNode[];
  // The signed-in user's persisted manual node positions, keyed by node id.
  // Optional/defaulted so existing call sites that only pass `nodes` keep
  // working.
  positions?: Record<string, [number, number, number]>;
}

export default function ExploreClient({ nodes, positions = {} }: ExploreClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Both hooks default to their SSR-safe "false" snapshot and self-correct
  // against the real client value before paint — no manual mount-detection
  // effect needed.
  const reducedMotion = useReducedMotion();
  const webglSupported = useWebglSupported();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // An unlocked-but-not-yet-studied label being previewed (from the wheel or
  // a related pill) — mutually exclusive with selectedNodeId.
  const [previewLabel, setPreviewLabel] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeGraphNode | null>(null);
  // deleteKnowledgeNode never throws, so failure has to be read from its
  // result instead of a catch block.
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Whichever HTML control triggered a selection, so "Back to overview" can
  // refocus it.
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  // Fallback focus target when deleting the selected node removes its own
  // trigger from the DOM.
  const graphRegionRef = useRef<HTMLDivElement>(null);
  // Closes the window where two Confirm clicks land before `isPending`
  // updates and both start a delete.
  const isDeletingRef = useRef(false);

  const handleSelect = useCallback((id: string, trigger?: HTMLElement | null) => {
    lastTriggerRef.current = trigger ?? null;
    setPreviewLabel(null);
    setSelectedNodeId(id);
  }, []);

  const handlePreview = useCallback((label: string) => {
    lastTriggerRef.current = null;
    setSelectedNodeId(null);
    setPreviewLabel(label);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedNodeId(null);
    setPreviewLabel(null);
    lastTriggerRef.current?.focus();
    lastTriggerRef.current = null;
  }, []);

  const selectedNode = selectedNodeId ? (nodes.find((node) => node.id === selectedNodeId) ?? null) : null;

  const nodesByTopicKey = useMemo(() => new Map(nodes.map((node) => [node.topicKey, node])), [nodes]);

  const relatedItems: RelatedItem[] = useMemo(() => {
    if (!selectedNode) return [];
    return selectedNode.relatedLabels.map((label) => ({
      label,
      nodeId: nodesByTopicKey.get(normalizeTopicKey(label))?.id ?? null,
    }));
  }, [selectedNode, nodesByTopicKey]);

  // Exactly the nodes that exist in the graph — not-yet-studied suggestions
  // surface instead in a selected node's Related list.
  const allTopicLabels = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const topicNode of nodes) {
      if (seen.has(topicNode.topicKey)) continue;
      seen.add(topicNode.topicKey);
      result.push(topicNode.label);
    }
    return result;
  }, [nodes]);

  function handleTopicChoice(label: string, trigger?: HTMLElement | null) {
    const existing = nodesByTopicKey.get(normalizeTopicKey(label));
    if (existing) {
      handleSelect(existing.id, trigger);
    } else {
      handlePreview(label);
    }
  }

  function handleRequestDelete(node: KnowledgeGraphNode) {
    setDeleteError(null);
    setDeleteTarget(node);
  }

  function handleConfirmDelete() {
    if (isDeletingRef.current) return;
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    isDeletingRef.current = true;
    startTransition(async () => {
      try {
        const result = await deleteKnowledgeNode(id);
        if (!result.ok) {
          setDeleteError("Couldn't delete this topic. Please try again.");
          return;
        }
        if (selectedNodeId === id) {
          // Not handleBack(): its trigger is the node being deleted, so
          // focus the stable graph region instead.
          setSelectedNodeId(null);
          setPreviewLabel(null);
          lastTriggerRef.current = null;
          graphRegionRef.current?.focus();
        }
        router.refresh();
      } finally {
        isDeletingRef.current = false;
      }
    });
  }

  const level = levelForNodeCount(nodes.length);
  const showScene = !reducedMotion && webglSupported;
  const showPanel = selectedNode !== null || previewLabel !== null;

  return (
    // Fills whatever fixed-height <main> page.tsx leaves it, so nothing
    // here forces a page-level scroll.
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Mirrors the graph/list split below so "Topics" sits above the list it labels. */}
      <div className="flex shrink-0 items-center gap-4">
        <div className="flex flex-1 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Knowledge Level {level.level} · {level.name}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {nodes.length} topic{nodes.length === 1 ? "" : "s"}
          </span>
          {nodes.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <ResetGraphControl />
            </>
          )}
        </div>
        <p className="hidden w-72 shrink-0 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase md:block">
          Topics
        </p>
      </div>

      {/* min(560px,100%) caps the row's height so it doesn't stretch
          under the floating dock on short windows. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex h-[min(560px,100%)] w-full gap-4">
          <div
            ref={graphRegionRef}
            tabIndex={-1}
            aria-label="Interactive 3D knowledge space. Use the topic list for keyboard access."
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-zinc-800 bg-[#08070c] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80"
          >
            {showScene ? (
              <Scene
                nodes={nodes}
                initialPositions={positions}
                selectedNodeId={selectedNodeId}
                onSelect={handleSelect}
              />
            ) : (
              <StaticFallback nodes={nodes} selectedNodeId={selectedNodeId} onSelect={handleSelect} />
            )}

            {nodes.length === 0 && !showPanel && (
              <div className="absolute inset-x-3 bottom-3 z-10 rounded-xl border border-zinc-800 bg-[#0c0b12]/95 p-4 text-center backdrop-blur-sm sm:inset-x-auto sm:right-4 sm:bottom-4 sm:left-4">
                <p className="text-sm font-medium text-zinc-100">Your knowledge graph starts here.</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Study something on Generate to begin growing your universe.
                </p>
              </div>
            )}

            {showPanel && (
              <TopicPanel
                node={selectedNode}
                previewLabel={selectedNode ? null : previewLabel}
                relatedItems={relatedItems}
                onBack={handleBack}
                onSelect={handleSelect}
                onPreview={handlePreview}
                onDelete={handleRequestDelete}
              />
            )}
          </div>

          {/* md:+ only — small screens use the bottom chip row instead, since
              the wheel needs real vertical room to read as a list. */}
          <aside aria-label="Topics" className="hidden min-h-0 w-72 shrink-0 md:flex md:flex-col">
            {/* OptionWheel's defaults are sized for a full-bleed demo, not this ~288px sidebar. */}
            <OptionWheel
              items={allTopicLabels}
              side="right"
              fontSize={1.05}
              spacing={1.7}
              curve={0.6}
              tilt={3}
              blur={1.5}
              fade={0.22}
              minOpacity={0.15}
              inset={20}
              textColor="var(--muted-foreground)"
              activeColor="var(--foreground)"
              onChange={(_index, label, element) => handleTopicChoice(label, element)}
              aria-label="Topics"
            />
          </aside>
        </div>
      </div>

      {/* Mobile: a compact chip row, same topic list as the wheel above. */}
      {allTopicLabels.length > 0 && (
        <div className="shrink-0 md:hidden">
          <p className="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Topics
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {allTopicLabels.map((label) => {
              const existing = nodesByTopicKey.get(normalizeTopicKey(label));
              const isSelected = existing !== undefined && existing.id === selectedNodeId;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={(event) => handleTopicChoice(label, event.currentTarget)}
                  className={
                    isSelected
                      ? "rounded-full border border-indigo-400/60 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-foreground"
                      : "rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete "${deleteTarget.label}"?` : "Delete Topic"}
        description="This removes the topic and anything nested under it from your knowledge graph. This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        confirmDisabled={isPending}
      />
      {/* role="alert" announces this to screen readers immediately, and stays visible for sighted users too. */}
      {deleteError && (
        <p role="alert" className="shrink-0 text-center text-xs text-destructive">
          {deleteError}
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {isPending ? "Updating your knowledge graph…" : ""}
      </span>
    </div>
  );
}
