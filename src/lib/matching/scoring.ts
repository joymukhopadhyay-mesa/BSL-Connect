import { CAREER_OBJECTIVES, QUESTION_BY_KEY, optionLabel, type QuestionKey } from "@/lib/profile/options";
import type { Profile } from "@/lib/profile/types";
import { DEFAULT_WEIGHTS, FACTOR_LABELS, MIN_WEIGHT_COVERAGE, validateWeights, type FactorKey, type Weights } from "./weights";

/**
 * Deterministic, explainable compatibility between a viewer ("you") and a
 * candidate ("they").
 *
 * Design decisions (see docs/MATCHING.md):
 *  - Pure function of structured profile data: identical inputs always give
 *    identical outputs. No randomness, no clock, no AI.
 *  - Complementarity is rewarded: a candidate whose strengths cover what
 *    you asked a partner for scores higher than one who duplicates you.
 *  - Experience (where someone has worked) and interest (where they want to
 *    explore) are separate inputs and never merged.
 *  - Working-style differences are not penalties: an "opposite" pairing
 *    scores in the middle of the range and is surfaced as a discussion point.
 *    No style scores higher on its own.
 *  - Missing inputs make a factor "unavailable" rather than zero. If too
 *    little can be computed the result is "insufficient", not a low score.
 *  - The output is an indication for discussion, not a prediction.
 */

export type ScoringProfile = Pick<
  Profile,
  | "strengths" | "development_areas" | "industries_experience" | "industries_interest"
  | "partner_skills" | "partner_industries" | "career_objective" | "questionnaire"
>;

export type FactorResult = {
  key: FactorKey;
  label: string;
  weight: number;
  /** 0–1, or null when the inputs needed are missing. */
  score: number | null;
  /** Plain-language observations grounded in submitted data. */
  evidence: string[];
};

export type Band = "strong" | "promising" | "exploratory" | "insufficient";

export type CompatibilityResult = {
  /** 0–100 rounded to the nearest 5, or null when there is too little data. */
  score: number | null;
  band: Band;
  bandLabel: string;
  factors: FactorResult[];
  coverage: number;
};

export const BAND_LABELS: Record<Band, string> = {
  strong: "Strong potential fit",
  promising: "Promising fit",
  exploratory: "Worth exploring",
  insufficient: "Not enough information yet",
};

// ---------------------------------------------------------------------------
// Set helpers (case-insensitive, preserving the first display spelling)
// ---------------------------------------------------------------------------

type LabelSet = Map<string, string>;

export function labelSet(values: readonly string[] | null | undefined): LabelSet {
  const m: LabelSet = new Map();
  for (const v of values ?? []) {
    const key = v.trim().toLowerCase();
    if (key && !m.has(key)) m.set(key, v.trim());
  }
  return m;
}

export function intersect(a: LabelSet, b: LabelSet): string[] {
  const out: string[] = [];
  for (const [k, label] of a) if (b.has(k)) out.push(label);
  return out.sort((x, y) => x.localeCompare(y));
}

export function difference(a: LabelSet, b: LabelSet): string[] {
  const out: string[] = [];
  for (const [k, label] of a) if (!b.has(k)) out.push(label);
  return out.sort((x, y) => x.localeCompare(y));
}

function union(a: LabelSet, b: LabelSet): LabelSet {
  const m = new Map(a);
  for (const [k, v] of b) if (!m.has(k)) m.set(k, v);
  return m;
}

/** Share of `wanted` that `provided` covers; null if nothing is wanted. */
function coverage(provided: LabelSet, wanted: LabelSet): number | null {
  if (wanted.size === 0) return null;
  return intersect(wanted, provided).length / wanted.size;
}

/** Overlap coefficient |A∩B| / min(|A|,|B|); null if either is empty. */
function overlap(a: LabelSet, b: LabelSet): number | null {
  if (a.size === 0 || b.size === 0) return null;
  return intersect(a, b).length / Math.min(a.size, b.size);
}

function mean(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((s, v) => s + v, 0) / present.length;
}

function list(items: string[], max = 3): string {
  const shown = items.slice(0, max);
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Questionnaire comparisons
// ---------------------------------------------------------------------------

function answer(p: ScoringProfile, key: QuestionKey): string | string[] | null {
  const v = p.questionnaire?.answers?.[key];
  if (typeof v === "string" && v) return v;
  if (Array.isArray(v) && v.length) return v;
  return null;
}

/** Flexible answers sit between the two poles of a dimension. */
const FLEXIBLE = new Set(["balanced", "mixed", "adaptive", "depends", "comfortable"]);

/**
 * Similarity for single-choice dimensions. Identical → 1. Flexible with
 * anything → 0.85. Different poles → 0.6: a genuine difference to discuss,
 * which may be productive, so it is not scored as a mismatch.
 */
function singleSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (FLEXIBLE.has(a) || FLEXIBLE.has(b)) return 0.85;
  return 0.6;
}

function multiSimilarity(a: string[], b: string[]): number {
  const o = overlap(labelSet(a), labelSet(b)) ?? 0;
  return 0.55 + 0.45 * o;
}

export type StyleComparison = {
  key: QuestionKey;
  dimension: string;
  similarity: number;
  you: string;
  they: string;
  same: boolean;
};

export function compareDimension(you: ScoringProfile, they: ScoringProfile, key: QuestionKey): StyleComparison | null {
  const a = answer(you, key);
  const b = answer(they, key);
  if (a === null || b === null) return null;
  const q = QUESTION_BY_KEY[key];
  // Sentence-case labels for inline use, keeping the pronoun "I" capitalised.
  const lower = (label: string) => (/^I\b/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1));
  const fmt = (v: string | string[]) => (Array.isArray(v) ? v.map((x) => lower(optionLabel(key, x))).join(" / ") : lower(optionLabel(key, v)));
  if (q.type === "single" && typeof a === "string" && typeof b === "string") {
    return { key, dimension: q.dimension, similarity: singleSimilarity(a, b), you: fmt(a), they: fmt(b), same: a === b };
  }
  const aa = Array.isArray(a) ? a : [a];
  const bb = Array.isArray(b) ? b : [b];
  const sim = multiSimilarity(aa, bb);
  return { key, dimension: q.dimension, similarity: sim, you: fmt(aa), they: fmt(bb), same: sim >= 0.99 };
}

function styleFactor(you: ScoringProfile, they: ScoringProfile, keys: QuestionKey[]) {
  const comparisons = keys.map((k) => compareDimension(you, they, k)).filter((c): c is StyleComparison => c !== null);
  if (comparisons.length < Math.ceil(keys.length / 2)) return { score: null, comparisons };
  return { score: mean(comparisons.map((c) => c.similarity)), comparisons };
}

// ---------------------------------------------------------------------------
// Factors
// ---------------------------------------------------------------------------

function complementarity(you: ScoringProfile, they: ScoringProfile): Omit<FactorResult, "key" | "label" | "weight"> {
  const youWant = union(labelSet(you.partner_skills), labelSet(you.development_areas));
  const theyWant = union(labelSet(they.partner_skills), labelSet(they.development_areas));
  const theyBring = labelSet(they.strengths);
  const youBring = labelSet(you.strengths);
  const forYou = intersect(youWant, theyBring);
  const forThem = intersect(theyWant, youBring);
  const evidence: string[] = [];
  if (forYou.length) evidence.push(`They list ${list(forYou)} as strengths — areas you asked a partner for or are developing.`);
  if (forThem.length) evidence.push(`You bring ${list(forThem)}, which they are looking for.`);
  if (!forYou.length && !forThem.length && (youWant.size || theyWant.size)) {
    evidence.push("Neither of you lists a strength the other asked for.");
  }
  return { score: mean([coverage(theyBring, youWant), coverage(youBring, theyWant)]), evidence };
}

function industry(you: ScoringProfile, they: ScoringProfile): Omit<FactorResult, "key" | "label" | "weight"> {
  const youInterest = labelSet(you.industries_interest);
  const theyInterest = labelSet(they.industries_interest);
  const shared = intersect(youInterest, theyInterest);
  const o = overlap(youInterest, theyInterest);
  const pref = mean([
    coverage(theyInterest, labelSet(you.partner_industries)),
    coverage(youInterest, labelSet(they.partner_industries)),
  ]);
  const evidence: string[] = [];
  if (shared.length) evidence.push(`You both want to explore ${list(shared)}.`);
  else if (o !== null) evidence.push("Your industries of interest don't overlap yet.");
  const score = o === null ? null : pref === null ? o : 0.6 * o + 0.4 * pref;
  return { score, evidence };
}

function experience(you: ScoringProfile, they: ScoringProfile): Omit<FactorResult, "key" | "label" | "weight"> {
  const youInterest = labelSet(you.industries_interest);
  const theyInterest = labelSet(they.industries_interest);
  const theyExp = labelSet(they.industries_experience);
  const youExp = labelSet(you.industries_experience);
  const theyKnow = intersect(theyExp, youInterest);
  const youKnow = intersect(youExp, theyInterest);
  // Experience meeting the other's curiosity. Someone with no prior industry
  // experience is not penalised here beyond this half of the factor.
  const relevance = mean([
    youInterest.size ? theyKnow.length / youInterest.size : null,
    theyInterest.size ? youKnow.length / theyInterest.size : null,
  ]);
  const youS = labelSet(you.strengths);
  const theyS = labelSet(they.strengths);
  const newToYou = difference(theyS, youS);
  const newToThem = difference(youS, theyS);
  const breadth = youS.size || theyS.size ? Math.min((newToYou.length + newToThem.length) / 4, 1) : null;

  const evidence: string[] = [];
  if (theyKnow.length) evidence.push(`They have worked in ${list(theyKnow)}, which you want to explore.`);
  if (youKnow.length) evidence.push(`You have worked in ${list(youKnow)}, which they want to explore.`);
  if (newToYou.length) evidence.push(`Together you'd add ${list(newToYou)} to your own strengths.`);
  const score = relevance === null ? breadth : breadth === null ? relevance : 0.5 * relevance + 0.5 * breadth;
  return { score, evidence };
}

function objectiveSimilarity(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  if (a === b) return 1;
  if (a === "undecided" || b === "undecided") return 0.65;
  const ga = CAREER_OBJECTIVES.find((c) => c.value === a)?.group;
  const gb = CAREER_OBJECTIVES.find((c) => c.value === b)?.group;
  return ga && ga === gb ? 0.75 : 0.45;
}

function goals(you: ScoringProfile, they: ScoringProfile): Omit<FactorResult, "key" | "label" | "weight"> {
  const obj = objectiveSimilarity(you.career_objective, they.career_objective);
  const exp = compareDimension(you, they, "expectations");
  const evidence: string[] = [];
  if (obj === 1) evidence.push("You share the same career objective.");
  else if (obj !== null && obj >= 0.75) evidence.push("Your career objectives are in closely related fields.");
  else if (obj !== null) evidence.push("You're heading towards different career outcomes, which can widen a project's perspective.");
  if (exp && exp.similarity > 0.6) evidence.push(`You both expect ${exp.you === exp.they ? exp.you : "overlapping things"} from a partner.`);
  const score = obj === null ? (exp ? exp.similarity : null) : exp ? 0.6 * obj + 0.4 * exp.similarity : obj;
  return { score, evidence };
}

function describeComparisons(comparisons: StyleComparison[]): string[] {
  const evidence: string[] = [];
  const aligned = comparisons.filter((c) => c.same).map((c) => c.dimension.toLowerCase());
  if (aligned.length) evidence.push(`Aligned on ${list(aligned, 4)}.`);
  for (const c of comparisons.filter((x) => !x.same && x.similarity < 0.85)) {
    evidence.push(`${c.dimension}: you — ${c.you}; they — ${c.they}.`);
  }
  return evidence;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const WORKING_KEYS: QuestionKey[] = ["working_style", "decision_making", "ownership", "ambiguity", "execution", "pressure"];
const COMMUNICATION_KEYS: QuestionKey[] = ["communication", "conflict", "feedback"];

export function scoreCompatibility(
  you: ScoringProfile,
  they: ScoringProfile,
  weights: Weights = DEFAULT_WEIGHTS,
): CompatibilityResult {
  validateWeights(weights);
  const working = styleFactor(you, they, WORKING_KEYS);
  const comms = styleFactor(you, they, COMMUNICATION_KEYS);

  const raw: Record<FactorKey, Omit<FactorResult, "key" | "label" | "weight">> = {
    complementarity: complementarity(you, they),
    industry: industry(you, they),
    experience: experience(you, they),
    workingStyle: { score: working.score, evidence: describeComparisons(working.comparisons) },
    goals: goals(you, they),
    communication: { score: comms.score, evidence: describeComparisons(comms.comparisons) },
  };

  const factors: FactorResult[] = (Object.keys(weights) as FactorKey[]).map((key) => ({
    key,
    label: FACTOR_LABELS[key],
    weight: weights[key],
    score: raw[key].score === null ? null : Math.max(0, Math.min(1, raw[key].score!)),
    evidence: raw[key].evidence,
  }));

  const available = factors.filter((f) => f.score !== null);
  const coverageWeight = available.reduce((s, f) => s + f.weight, 0);
  if (coverageWeight < MIN_WEIGHT_COVERAGE - 1e-9) {
    return { score: null, band: "insufficient", bandLabel: BAND_LABELS.insufficient, factors, coverage: coverageWeight };
  }
  const weighted = available.reduce((s, f) => s + f.weight * f.score!, 0) / coverageWeight;
  // Rounded to the nearest 5 to avoid implying false precision.
  const score = Math.round((weighted * 100) / 5) * 5;
  const band: Band = score >= 75 ? "strong" : score >= 60 ? "promising" : "exploratory";
  return { score, band, bandLabel: BAND_LABELS[band], factors, coverage: coverageWeight };
}

/** Stable ordering for the discovery deck: score desc, unknown last, then id. */
export function rankCandidates<T extends { id: string }>(
  candidates: Array<T & { compatibility: CompatibilityResult }>,
): Array<T & { compatibility: CompatibilityResult }> {
  return [...candidates].sort((a, b) => {
    const sa = a.compatibility.score ?? -1;
    const sb = b.compatibility.score ?? -1;
    if (sb !== sa) return sb - sa;
    return a.id.localeCompare(b.id);
  });
}
