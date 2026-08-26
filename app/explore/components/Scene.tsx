"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import AmbientField from "./AmbientField";
import CameraRig from "./CameraRig";
import KnowledgeGraph from "./KnowledgeGraph";
import { applyManualOverrides, computeGraphLayout, maxLayoutRadius, toVector3 } from "../graphLayout";
import type { KnowledgeGraphNode } from "../data";
import { saveKnowledgeNodePosition } from "@/lib/supabase/knowledge-graph-actions";

const FOV = 42;
// The direction the overview camera looks from — only its distance changes
// (see computeOverviewPosition), so the graph is always viewed from the same
// angle regardless of how big it's grown.
const OVERVIEW_DIRECTION: [number, number, number] = [0, 0.185, 0.983];
const MIN_OVERVIEW_DISTANCE = 6.5;
const MAX_OVERVIEW_DISTANCE = 20;
// How much of the frustum's half-height the graph's own radius should
// occupy at the overview distance — leaves margin so outer nodes aren't
// pinned right at the frame edge.
const FIT_FRACTION = 0.62;

/** Camera distance (and therefore position) that frames a graph of the given
 * radius: small graphs sit close so Core isn't dwarfed by empty space, large
 * ones pull back so nothing spills off-screen — instead of one fixed
 * distance that only ever fit one particular graph size. */
function computeOverviewPosition(maxRadius: number): [number, number, number] {
  const fovRad = (FOV * Math.PI) / 180;
  const raw = maxRadius / (FIT_FRACTION * Math.tan(fovRad / 2));
  const distance = Math.min(MAX_OVERVIEW_DISTANCE, Math.max(MIN_OVERVIEW_DISTANCE, raw));
  return [
    OVERVIEW_DIRECTION[0] * distance,
    OVERVIEW_DIRECTION[1] * distance,
    OVERVIEW_DIRECTION[2] * distance,
  ];
}

interface SceneProps {
  nodes: KnowledgeGraphNode[];
  // The signed-in user's persisted manual positions, hydrated server-side
  // (see ExploreClient.tsx). Only ever read as `manualPositions`' initial
  // value — a drag committed this session always wins over a stale server
  // snapshot.
  initialPositions: Record<string, [number, number, number]>;
  selectedNodeId: string | null;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
}

function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function getDpr(): [number, number] {
  return isCoarsePointer() ? [1, 1.5] : [1, 2];
}

function getAmbientCount(): number {
  return isCoarsePointer() ? 6 : 12;
}

function getStarCount(): number {
  return isCoarsePointer() ? 1500 : 3500;
}

// Only ever mounted once ExploreClient has confirmed WebGL support and that
// reduced motion is off. Restrained lighting, no shadows, no
// postprocessing — orbit/zoom is supplemental, click-to-focus (CameraRig) is
// the primary interaction.
export default function Scene({ nodes, initialPositions, selectedNodeId, onSelect }: SceneProps) {
  const baseLayout = useMemo(() => computeGraphLayout(nodes), [nodes]);

  // Seeded once from `initialPositions`, then updated locally as the user
  // drags — never re-synced via an effect, so a stale server snapshot can't
  // overwrite a drag already committed this session. Lives here (not
  // ExploreClient) because Scene stays mounted across a `nodes` prop change.
  const [manualPositions, setManualPositions] =
    useState<Record<string, [number, number, number]>>(initialPositions);
  const handleNodeDragEnd = useCallback((id: string, dragged: [number, number, number]) => {
    setManualPositions((prev) => ({ ...prev, [id]: dragged }));
    // Fire-and-forget — the local update above is what the scene reacts to.
    void saveKnowledgeNodePosition(id, dragged);
  }, []);

  const layout = useMemo(
    () => applyManualOverrides(baseLayout, manualPositions),
    [baseLayout, manualPositions],
  );

  // Two radii for two jobs (see cameraTransition.ts): `structuralMaxRadius`
  // comes from `baseLayout` alone, so a drag can never re-arm CameraRig's
  // fly-to. `visualMaxRadius`/`overviewPosition` include manual overrides,
  // since framing should reflect what the user actually sees once a
  // transition is warranted.
  const structuralMaxRadius = useMemo(() => maxLayoutRadius(baseLayout), [baseLayout]);
  const visualMaxRadius = useMemo(() => maxLayoutRadius(layout), [layout]);
  const overviewPosition = useMemo(() => computeOverviewPosition(visualMaxRadius), [visualMaxRadius]);

  // Every node's absolute position, for CameraRig to focus on.
  const focusPositions = useMemo(() => {
    const positions: Record<string, [number, number, number]> = {};
    for (const entry of layout) {
      positions[entry.id] = toVector3(entry);
    }
    return positions;
  }, [layout]);

  return (
    <Canvas
      dpr={getDpr()}
      camera={{ position: overviewPosition, fov: FOV }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => gl.setClearColor("#08070c")}
    >
      {/* Matches the clear color so distance reads as fading into the
          background rather than a visible haze. Far distance tracks
          MAX_OVERVIEW_DISTANCE so a pulled-back graph doesn't fade early. */}
      <fog attach="fog" args={["#08070c", 10, MAX_OVERVIEW_DISTANCE + 8]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 5, 3]} intensity={0.8} color="#c4b5fd" />
      {/* Faint warm lift on Core and its nearest neighbors, not a visible light source. */}
      <pointLight
        position={[0, 0.3, 2]}
        intensity={0.45}
        distance={5}
        color="#e08fc4"
      />
      {/* Decorative background star-dust, distinct from AmbientField's drifting shapes. */}
      <Stars radius={20} depth={25} count={getStarCount()} factor={1.4} fade speed={0.3} />
      <AmbientField count={getAmbientCount()} />
      <Suspense fallback={null}>
        <KnowledgeGraph
          nodes={nodes}
          layout={layout}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
          onDragEnd={handleNodeDragEnd}
        />
      </Suspense>
      <CameraRig
        selectedNodeId={selectedNodeId}
        focusPositions={focusPositions}
        overviewPosition={overviewPosition}
        structuralMaxRadius={structuralMaxRadius}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        // +1.8x margin matches CameraRig's portrait aspect-fit cap.
        maxDistance={MAX_OVERVIEW_DISTANCE * 1.8 + 6}
        // Nearly full vertical range; kept short of the poles, where
        // OrbitControls' up-vector handling degenerates.
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI - 0.05}
      />
    </Canvas>
  );
}
