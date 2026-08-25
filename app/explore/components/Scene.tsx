"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import AmbientField from "./AmbientField";
import CameraRig from "./CameraRig";
import KnowledgeGraph from "./KnowledgeGraph";
import { applyManualOverrides, computeGraphLayout, maxLayoutRadius, toVector3 } from "../graphLayout";
import type { KnowledgeGraphNode } from "../data";

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
export default function Scene({ nodes, selectedNodeId, onSelect }: SceneProps) {
  const baseLayout = useMemo(() => computeGraphLayout(nodes), [nodes]);

  // Session-only manual positions (Step 7: no persistence layer exists for
  // this yet — see graphLayout.ts's own comment on applyManualOverrides).
  // Lives here, not in ExploreClient, since Scene is the one component that
  // actually stays mounted across a `nodes` prop change (a new topic
  // studied elsewhere, a delete's `router.refresh()`) — keeping this state
  // local, rather than lifted, is what lets a dragged position survive
  // those updates without the automatic placement system ever needing to
  // know a node was moved.
  const [manualPositions, setManualPositions] = useState<Record<string, [number, number, number]>>({});
  const handleNodeDragEnd = useCallback((id: string, dragged: [number, number, number]) => {
    setManualPositions((prev) => ({ ...prev, [id]: dragged }));
  }, []);

  const layout = useMemo(
    () => applyManualOverrides(baseLayout, manualPositions),
    [baseLayout, manualPositions],
  );

  // How far back the camera needs to sit to fit the graph's actual extent —
  // recomputed as the graph grows or shrinks, not just once at mount.
  const overviewPosition = useMemo(
    () => computeOverviewPosition(maxLayoutRadius(layout)),
    [layout],
  );

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
      {/*
        Matches the clear color exactly, so it reads as the far end of the
        scene fading toward its own background rather than a visible haze —
        the only depth cue here besides geometry size/perspective, since the
        scene has nothing else to anchor "near" vs. "far" against. Far
        distance tracks MAX_OVERVIEW_DISTANCE so a big, pulled-back graph
        doesn't start fading into the background before it's fully visible.
      */}
      <fog attach="fog" args={["#08070c", 10, MAX_OVERVIEW_DISTANCE + 8]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 5, 3]} intensity={0.8} color="#c4b5fd" />
      {/* Short-range, low-intensity: only gives Lumora Core and its nearest
          neighbors a faint extra lift, not a visible light source. Pink-
          leaning (the brand gradient's hot end) rather than flat indigo, so
          Core casts a faint warm-brand tint. */}
      <pointLight
        position={[0, 0.3, 2]}
        intensity={0.45}
        distance={5}
        color="#e08fc4"
      />
      {/* Fine background star-dust, well outside the graph's own radius —
          purely decorative depth cue, distinct from AmbientField's larger
          drifting shard/ring shapes. Default saturation=0 renders white/pale
          points, which needs no brand-color tuning of its own. */}
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
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        // +1.8x margin matches CameraRig's own portrait aspect-fit cap, so a
        // tall/narrow window's pulled-back overview never bumps this ceiling.
        maxDistance={MAX_OVERVIEW_DISTANCE * 1.8 + 6}
        // Free look: nearly the full vertical range, so orbiting can look
        // down over the top of the graph or up from underneath it. Kept
        // just short of the exact poles (0/π) — OrbitControls' own
        // up-vector handling degenerates there.
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI - 0.05}
      />
    </Canvas>
  );
}
