// A lightweight sense of progression, not a gamification system: no XP
// bars, just a name derived from how many topics the user has actually
// studied. Pure and deterministic — no separate table, computed fresh from
// the node count every time.
export const LEVELS = [
  { level: 1, name: "Curious", minNodes: 0 },
  { level: 2, name: "Explorer", minNodes: 4 },
  { level: 3, name: "Learner", minNodes: 8 },
  { level: 4, name: "Scholar", minNodes: 15 },
  { level: 5, name: "Knowledge Builder", minNodes: 25 },
  { level: 6, name: "Lumora Adept", minNodes: 40 },
] as const;

export type LumoraLevel = (typeof LEVELS)[number];

/**
 * A fresh graph (0 nodes) still reads as Level 1 "Curious" rather than
 * unleveled — everyone starts somewhere, the level just doesn't move yet.
 */
export function levelForNodeCount(count: number): LumoraLevel {
  let current: LumoraLevel = LEVELS[0];
  for (const entry of LEVELS) {
    if (count >= entry.minNodes) current = entry;
  }
  return current;
}
