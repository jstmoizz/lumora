/**
 * Shared topic-key normalization for Explore's knowledge graph — the same
 * function used wherever a topic label needs to be compared for dedup
 * (writing a node, matching a related label against existing nodes).
 * Deliberately just lowercase + trim + collapse whitespace, not fuzzy/
 * embedding-based matching: "Supervised Learning", "supervised learning ",
 * and "SUPERVISED LEARNING" all key to the same node, which covers the
 * common case (the model rephrasing the same topic slightly differently
 * across turns) without a second matching system to maintain.
 */
export function normalizeTopicKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}
