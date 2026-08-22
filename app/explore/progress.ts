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
