"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import AmbientField from "./AmbientField";
import CameraRig from "./CameraRig";
import KnowledgeGraph from "./KnowledgeGraph";
import { KNOWLEDGE_NODES } from "../data";
import type { TopicProgress } from "@/lib/supabase/topic-progress";

interface SceneProps {
  selectedNodeId: string | null;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
  progress: Record<string, TopicProgress>;
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

// Only ever mounted once ExploreClient has confirmed WebGL support and that
// reduced motion is off. Restrained lighting, no shadows, no
// postprocessing — orbit/zoom is supplemental, click-to-focus (CameraRig) is
// the primary interaction.
export default function Scene({ selectedNodeId, onSelect, progress }: SceneProps) {
  return (
    <Canvas
      dpr={getDpr()}
      camera={{ position: [0, 1.6, 8.6], fov: 42 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => gl.setClearColor("#08070c")}
    >
      {/*
        Matches the clear color exactly, so it reads as the far end of the
        scene fading toward its own background rather than a visible haze —
        the only depth cue here besides geometry size/perspective, since the
        scene has nothing else to anchor "near" vs. "far" against.
      */}
      <fog attach="fog" args={["#08070c", 9, 20]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 5, 3]} intensity={0.8} color="#c7c3ff" />
      {/* Short-range, low-intensity: only gives Lumora and its nearest
          neighbors a faint extra lift, not a visible light source. */}
      <pointLight
        position={[0, 0.3, 2]}
        intensity={0.4}
        distance={5}
        color="#7d76d9"
      />
      <AmbientField count={getAmbientCount()} />
      <Suspense fallback={null}>
        <KnowledgeGraph
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
          progress={progress}
        />
      </Suspense>
      <CameraRig selectedNodeId={selectedNodeId} nodes={KNOWLEDGE_NODES} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={13}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI - Math.PI / 4}
      />
    </Canvas>
  );
}
