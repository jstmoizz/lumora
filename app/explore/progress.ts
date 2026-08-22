// Pure mapping from a raw `study_count` to a restrained familiarity tier —
// unstudied / studied once / studied repeatedly — rather than scaling
// visuals continuously with the raw count. A continuous mapping risks
// runaway node sizes for a heavily-revisited topic and reads as a numeric
// score rather than a calm sense of familiarity; three fixed tiers match
// the three states this phase's visual behavior is spec'd around.
export type Familiarity = 0 | 1 | 2;

export function familiarityFor(studyCount: number | undefined): Familiarity {
  if (!studyCount || studyCount <= 0) return 0;
  if (studyCount === 1) return 1;
  return 2;
}

// Deterministic, per-topic gate for the expanded-concepts layer (Phase
// 4.3), derived from the same familiarity tiers rather than a second
// threshold model: an unstudied topic shows its core node only; studying it
// once surfaces a quiet textual hint that related concepts exist (see
// TopicPanel); studying it again and beyond reveals them as real,
// selectable nodes. Concepts under a topic all share that topic's own
// expansion state — there's no independent per-concept progress in this
// phase (see the Phase 4.3 report for why).
export type ExpansionState = "hidden" | "hinted" | "revealed";

export function expansionStateFor(
  studyCount: number | undefined,
): ExpansionState {
  const familiarity = familiarityFor(studyCount);
  if (familiarity === 0) return "hidden";
  if (familiarity === 1) return "hinted";
  return "revealed";
}
