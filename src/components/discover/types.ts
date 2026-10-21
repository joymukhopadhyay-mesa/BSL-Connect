import type { PairInsights } from "@/lib/matching/insights";
import type { CompatibilityResult } from "@/lib/matching/scoring";
import type { PublicProfile } from "@/lib/profile/types";

export type Candidate = PublicProfile & { compatibility: CompatibilityResult; insights: PairInsights };

export type Filters = {
  interest: string[];
  experience: string[];
  skills: string[];
  objective: string[];
  workingStyle: string[];
};

export const EMPTY_FILTERS: Filters = { interest: [], experience: [], skills: [], objective: [], workingStyle: [] };

export function activeFilterCount(f: Filters): number {
  return Object.values(f).reduce((n, v) => n + v.length, 0);
}

/** Within a group: any selected value matches. Across groups: all must match. */
export function matchesFilters(c: Candidate, f: Filters): boolean {
  const any = (selected: string[], values: string[]) =>
    selected.length === 0 || selected.some((s) => values.some((v) => v.toLowerCase() === s.toLowerCase()));
  const ws = c.questionnaire?.answers?.working_style;
  return (
    any(f.interest, c.industries_interest) &&
    any(f.experience, c.industries_experience) &&
    any(f.skills, c.strengths) &&
    any(f.objective, c.career_objective ? [c.career_objective] : []) &&
    any(f.workingStyle, typeof ws === "string" ? [ws] : [])
  );
}
