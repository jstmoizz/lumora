/** Deterministic, seeded [0,1) value from a string. Not cryptographic, just
 * stable and well-distributed (FNV-1a fold + an irrational-multiplier
 * scramble). Shared by graphLayout.ts and floatMotion.ts. */
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
