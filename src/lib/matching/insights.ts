import { compareDimension, difference, intersect, labelSet, type ScoringProfile, type StyleComparison } from "./scoring";
import type { QuestionKey } from "@/lib/profile/options";

/**
 * Pair-level ("team composition") observations computed only from submitted
 * profile data. These are labelled in the UI as observations, distinct from
 * AI-generated suggestions.
 */

/** Capabilities most BSL problem statements draw on. Used to spot gaps. */
export const CORE_BSL_CAPABILITIES = [
  "Strategy",
  "Research",
  "Finance",
  "Marketing",
  "Data analytics",
  "Communication",
] as const;

export type PairInsights = {
  complementaryForYou: string[];
  complementaryForThem: string[];
  overlapping: string[];
  sharedInterests: string[];
  theyHaveWorkedIn: string[];
  youHaveWorkedIn: string[];
  combinedGaps: string[];
  styleDifferences: StyleComparison[];
  styleAlignments: StyleComparison[];
  discussionQuestions: string[];
};

const STYLE_KEYS: QuestionKey[] = [
  "working_style", "ownership", "ambiguity", "execution", "communication", "conflict", "feedback", "decision_making",
];

const DIFFERENCE_QUESTIONS: Partial<Record<QuestionKey, string>> = {
  working_style: "One of you prefers to plan first and the other to experiment early. When will you stop exploring and commit to a direction?",
  ownership: "You prefer different amounts of shared work. Which parts will you own separately, and which will you do together?",
  ambiguity: "You respond differently to open-ended briefs. How will you handle it if the startup changes the problem midway?",
  execution: "One of you works to milestones and the other iterates quickly. What does 'done' look like for each deliverable?",
  communication: "You prefer different levels of detail in updates. What should a good weekly update between you contain?",
  conflict: "You handle disagreements differently. How will you raise and settle a disagreement about direction?",
  feedback: "You like feedback in different ways. How and when will you give each other feedback on drafts?",
  decision_making: "You reach decisions differently. Which decisions need data, and which can you make on judgement?",
};

export function pairInsights(you: ScoringProfile, they: ScoringProfile): PairInsights {
  const youStrengths = labelSet(you.strengths);
  const theyStrengths = labelSet(they.strengths);
  const youWant = labelSet([...(you.partner_skills ?? []), ...(you.development_areas ?? [])]);
  const theyWant = labelSet([...(they.partner_skills ?? []), ...(they.development_areas ?? [])]);

  const complementaryForYou = intersect(theyStrengths, youWant);
  const complementaryForThem = intersect(youStrengths, theyWant);
  const overlapping = intersect(youStrengths, theyStrengths);
  const sharedInterests = intersect(labelSet(you.industries_interest), labelSet(they.industries_interest));
  const theyHaveWorkedIn = intersect(labelSet(they.industries_experience), labelSet(you.industries_interest));
  const youHaveWorkedIn = intersect(labelSet(you.industries_experience), labelSet(they.industries_interest));

  const combined = labelSet([...(you.strengths ?? []), ...(they.strengths ?? [])]);
  const combinedGaps = difference(labelSet([...CORE_BSL_CAPABILITIES]), combined);

  const comparisons = STYLE_KEYS.map((k) => compareDimension(you, they, k)).filter(
    (c): c is StyleComparison => c !== null,
  );
  const styleDifferences = comparisons.filter((c) => !c.same && c.similarity < 0.85);
  const styleAlignments = comparisons.filter((c) => c.same);

  const discussionQuestions: string[] = [];
  if (combinedGaps.length) {
    discussionQuestions.push(
      `Neither of you lists ${combinedGaps.slice(0, 2).join(" or ")} as a strength. How will you cover it if the problem needs it?`,
    );
  }
  if (overlapping.length) {
    discussionQuestions.push(
      `You both bring ${overlapping[0]}. How will you divide that work so you aren't duplicating effort?`,
    );
  }
  for (const d of styleDifferences) {
    const q = DIFFERENCE_QUESTIONS[d.key];
    if (q) discussionQuestions.push(q);
  }
  discussionQuestions.push("How will you divide research, analysis and the final presentation?");

  return {
    complementaryForYou,
    complementaryForThem,
    overlapping,
    sharedInterests,
    theyHaveWorkedIn,
    youHaveWorkedIn,
    combinedGaps,
    styleDifferences,
    styleAlignments,
    discussionQuestions: discussionQuestions.slice(0, 5),
  };
}
