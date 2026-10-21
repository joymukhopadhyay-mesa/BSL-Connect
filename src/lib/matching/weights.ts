/**
 * Initial product defaults for the compatibility engine.
 *
 * These are reasonable starting points chosen by the product team, NOT
 * validated scientific measurements. They are expected to be tuned once
 * the programme has real outcome data (e.g. partnership satisfaction).
 * Weights must sum to 1. See docs/MATCHING.md for the reasoning.
 */
export const DEFAULT_WEIGHTS = {
  complementarity: 0.25,
  industry: 0.2,
  experience: 0.15,
  workingStyle: 0.2,
  goals: 0.1,
  communication: 0.1,
} as const;

export type FactorKey = keyof typeof DEFAULT_WEIGHTS;
export type Weights = Record<FactorKey, number>;

export const FACTOR_LABELS: Record<FactorKey, string> = {
  complementarity: "Complementary skills",
  industry: "Industry interests",
  experience: "Relevant experience and capabilities",
  workingStyle: "Working style",
  goals: "Career and learning goals",
  communication: "Communication and disagreements",
};

/**
 * If the factors we can actually compute carry less than this share of the
 * total weight, we report "not enough information" instead of a score.
 */
export const MIN_WEIGHT_COVERAGE = 0.6;

export function validateWeights(w: Weights): void {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  if (Object.values(w).some((v) => v < 0) || Math.abs(sum - 1) > 1e-6) {
    throw new Error(`Compatibility weights must be non-negative and sum to 1 (got ${sum}).`);
  }
}
