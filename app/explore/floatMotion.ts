import { hashToUnit } from "./deterministicHash";

// Restrained per-axis amplitude — small enough to read as "gently
// suspended," never enough to look like bouncing or a screensaver.
const AMPLITUDE = 0.045;
// Low frequency (rad/s): a full cycle takes roughly 25-30s, calm enough to
// read as "breathing," not an obvious animation loop.
const BASE_FREQUENCY = 0.22;

/**
 * A tiny, deterministic idle offset for a node's rendered position — three
 * out-of-phase sine waves keyed off the node's id, pure in `nodeId` and
 * `elapsedTime` so it can be driven straight from `state.clock.elapsedTime`
 * with no extra state, and unit-tested without any R3F/WebGL scaffolding.
 * `reducedMotion` disables it outright.
 */
export function computeFloatOffset(
  nodeId: string,
  elapsedTime: number,
  reducedMotion: boolean,
): [number, number, number] {
  if (reducedMotion) return [0, 0, 0];

  const seed = hashToUnit(nodeId);
  const phaseX = seed * Math.PI * 2;
  const phaseY = hashToUnit(`${nodeId}:y`) * Math.PI * 2;
  const phaseZ = hashToUnit(`${nodeId}:z`) * Math.PI * 2;
  // Small per-node frequency nudge (±15%) so nodes drift out of phase with
  // each other over time, rather than everything staying in lockstep purely
  // from a phase offset alone.
  const freq = BASE_FREQUENCY * (0.85 + seed * 0.3);

  return [
    Math.sin(elapsedTime * freq + phaseX) * AMPLITUDE,
    Math.sin(elapsedTime * freq * 0.8 + phaseY) * AMPLITUDE * 0.8,
    Math.sin(elapsedTime * freq * 1.15 + phaseZ) * AMPLITUDE,
  ];
}
