/** Deterministic, seeded [0,1) value from a string — no runtime randomness
 * involved, so the same input always produces the same output. Not
 * cryptographic, only stable and reasonably well-distributed (an FNV-1a-style
 * fold, then an irrational-multiplier scramble so adjacent seeds don't land
 * suspiciously close). Shared by graphLayout.ts (node placement) and
 * floatMotion.ts (idle float phase/frequency) so both draw from the same one
 * deterministic-randomness primitive instead of duplicating it. */
export function hashToUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) / 4294967296;
  const scrambled = normalized * 9973.1931;
  return scrambled - Math.floor(scrambled);
}
