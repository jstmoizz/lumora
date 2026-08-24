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
}

export default function ExploreClient({ nodes }: ExploreClientProps) {
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
  // Set only when a confirmed delete's Server Action reports failure
  // (`{ ok: false }`) — deleteKnowledgeNode already catches its own Supabase
  // errors rather than throwing, so this can't be caught with a try/catch;
  // it has to be read from the result. Cleared on the next delete attempt.
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Remembers whichever HTML control triggered a selection (a 3D-node click
  // has none) so "Back to overview" can return focus to it.
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  // Fallback focus target for the one case lastTriggerRef can't serve:
  // deleting the currently selected node, whose trigger disappears from the
  // DOM once `router.refresh()` commits. Always rendered regardless of node
  // count or topic-list layout.
  const graphRegionRef = useRef<HTMLDivElement>(null);
  // `isPending` doesn't update synchronously within the same event-handling
  // pass, so two Confirm clicks before React commits a render can both
  // start a delete. This ref closes that window — same pattern as
  // `isSubmittingRef` in ChatInterface.tsx.
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

  // The Topics list shows exactly the nodes that exist in the graph —
  // nothing inferred or not-yet-studied. Suggestions the model named but the
  // user hasn't studied yet still surface, just inside a selected node's own
  // "Related" list below (see `relatedItems` above), not mixed into this
  // one, which is meant to answer "what's actually in my graph."
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
          // Deletion failed server-side — leave the node and graph
          // untouched and surface why, instead of refreshing as if it had
          // succeeded. Retry path is just clicking Delete Topic again.
          setDeleteError("Couldn't delete this topic. Please try again.");
          return;
        }
        if (selectedNodeId === id) {
          // Not `handleBack()`: its trigger is the node that just got
          // deleted and won't survive `router.refresh()` below — send
          // focus to the stable graph region instead.
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
    // `min-h-0 flex-1` (not a fixed/vh height) so this exactly fills
    // whatever page.tsx's own fixed-height <main> leaves it — the whole
    // point of the fixed-page layout is that nothing here forces the page
    // itself to scroll; only OptionWheel's own wheel/drag handling "scrolls"
    // within its column.
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Mirrors the graph(flex-1)/list(w-72) split below it, so "Topics"
          sits directly above the list it labels instead of floating as a
          page-wide banner disconnected from either column. */}
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

      {/* Fixed-height row, vertically centered — the graph/list used to
          stretch to the viewport bottom, where the floating dock sits,
          hiding the list's lower items on short windows. min(560px,100%)
          caps that height while still shrinking to fit. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex h-[min(560px,100%)] w-full gap-4">
          {/* flex-1 + min-w-0: stretches to fill essentially the whole width
              next to the topic list, instead of sitting in a narrow centered
              column with empty space on both sides. */}
          <div
            ref={graphRegionRef}
            tabIndex={-1}
            aria-label="Interactive 3D knowledge space. Use the topic list for keyboard access."
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-zinc-800 bg-[#08070c] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80"
          >
            {showScene ? (
              <Scene nodes={nodes} selectedNodeId={selectedNodeId} onSelect={handleSelect} />
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

          {/* Docked at the right edge on anything wider than a phone (md:+) —
              true small-screen widths fall back to the bottom chip row below,
              since the wheel needs real vertical room to read as a list
              rather than a cramped column. Shows exactly the nodes in the
              graph — see `allTopicLabels`'s own comment for why unlocked
              suggestions live in a selected node's Related list instead. */}
          <aside aria-label="Topics" className="hidden min-h-0 w-72 shrink-0 md:flex md:flex-col">
            {/*
              OptionWheel's own defaults (fontSize 3rem, inset 80px) are
              sized for a full-bleed demo, not this ~288px sidebar. Passing
              CSS variables for textColor/activeColor gets automatic
              light/dark support with no changes inside the component.
            */}
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

      {/* Mobile: a compact chip row instead of squeezing the wheel into a
          tiny sidebar — same topic list as the wheel above. */}
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
      {/*
        `role="alert"` is an implicit assertive live region — announced to
        screen readers the moment it appears, same as ChatErrorCard/
        SettingsClient's error rows elsewhere in the app, and (unlike the
        sr-only status span below) visible so sighted users see it too.
      */}
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
