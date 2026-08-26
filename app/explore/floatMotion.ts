import { hashToUnit } from "./deterministicHash";

// Restrained per-axis amplitude — small enough to read as "gently
// suspended," never enough to look like bouncing or a screensaver.
const AMPLITUDE = 0.045;
// Low frequency (rad/s): a full cycle takes roughly 25-30s, calm enough to
// read as "breathing," not an obvious animation loop.
const BASE_FREQUENCY = 0.22;

/**
 * A tiny, deterministic idle offset for a node's rendered position — no
 * physics, no per-frame randomness, just three out-of-phase sine waves keyed
 * off the node's own id (via hashToUnit) so every node's motion differs
 * without needing three independently "random" inputs. Purely a function of
 * `nodeId` and `elapsedTime`: the same inputs always produce the same
 * output, which is what lets this be driven straight from
 * `state.clock.elapsedTime` in a `useFrame` loop with no extra state to
 * manage, and what makes it safe to unit-test without any R3F/WebGL
 * scaffolding.
 *
 * `reducedMotion` is threaded through explicitly (rather than only relied on
 * structurally) so this function's own contract — "disabled for
 * reduced-motion users" — is independently true and testable, even though in
 * practice KnowledgeNode only ever renders at all when reduced motion is
 * off (see ExploreClient.tsx's `showScene`).
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
