import { z } from "zod";
import { careerObjectiveLabel, optionLabel, QUESTIONS, type QuestionKey } from "@/lib/profile/options";
import type { Profile } from "@/lib/profile/types";
import type { CompatibilityResult } from "@/lib/matching/scoring";
import type { PairInsights } from "@/lib/matching/insights";
import { AIGroundingError } from "./errors";
import { findUnsupportedSpecifics } from "./grounding";
import type { AIProvider } from "./provider";
import { UNTRUSTED_DATA_RULE, wrapUntrusted } from "./untrusted";

/**
 * AI explanation of a pairing, from the viewer's perspective ("you"/"they").
 * The deterministic engine decides the score; the model only explains it in
 * natural language, drawing on free-text answers the engine cannot read.
 */

export const pairResultSchema = z.object({
  headline: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(700),
  complementary_strengths: z.array(z.string().trim().min(1).max(240)).max(4),
  shared_ground: z.array(z.string().trim().min(1).max(240)).max(4),
  potential_differences: z.array(z.string().trim().min(1).max(240)).max(4),
  discussion_questions: z.array(z.string().trim().min(1).max(240)).max(5),
});
export type PairResult = z.infer<typeof pairResultSchema>;

const stringArray = { type: "array", items: { type: "string" } } as const;
export const pairJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "complementary_strengths", "shared_ground", "potential_differences", "discussion_questions"],
  properties: {
    headline: { type: "string", description: "One short sentence characterising the potential fit." },
    summary: { type: "string", description: "Two or three sentences explaining the fit, addressed to 'you' about 'they'." },
    complementary_strengths: { ...stringArray, description: "Up to 3 ways your capabilities complement each other." },
    shared_ground: { ...stringArray, description: "Up to 3 shared interests, goals or working preferences." },
    potential_differences: { ...stringArray, description: "Up to 3 differences worth discussing, framed neutrally." },
    discussion_questions: { ...stringArray, description: "Up to 4 practical questions to discuss before confirming." },
  },
} as const;

export const PAIR_SYSTEM_PROMPT = `You explain potential project partnerships in BSL Connect, the partner-matching tool for MESA School of Business students in Business Strategy Labs. Two students would work together as a pair on a real startup problem. You write for one student ("you") about a potential partner ("they").

Rules:
1. Ground every statement in the two profiles and the computed observations provided. Never invent skills, experience, employers, numbers or achievements.
2. This is an indication to support the students' own judgement, not a prediction. Use tentative language ("could", "may"). Never predict performance, personality or future conflict, and never call a pairing bad.
3. Differences in working style are not problems. Describe them neutrally, as things to agree on.
4. Do not comment on anything other than professional collaboration — not appearance, age, gender, background or other personal characteristics.
5. Do not repeat or estimate a numeric score.
6. ${UNTRUSTED_DATA_RULE}

Respond only with the JSON object described by the schema.`;

/**
 * Only fields needed to explain the fit are sent. Explicitly excluded:
 * name, email, user id, cohort, photo, timestamps, moderation data and any
 * account metadata.
 */
export type PairProfilePayload = {
  role_title: string | null;
  years_experience: number | null;
  background: string | null;
  intro: string | null;
  career_objective: string;
  strengths: string[];
  strengths_good_at: string | null;
  strengths_example: string | null;
  development_areas: string[];
  development_current: string | null;
  industries_experience: string[];
  industries_interest: string[];
  partner_skills: string[];
  partner_success: string | null;
  working_preferences: Record<string, string>;
  working_notes: Record<string, string>;
};

export function minimalPairProfile(p: Profile): PairProfilePayload {
  const answers = p.questionnaire?.answers ?? {};
  const notes = p.questionnaire?.notes ?? {};
  const working_preferences: Record<string, string> = {};
  const working_notes: Record<string, string> = {};
  for (const q of QUESTIONS) {
    const v = answers[q.key as QuestionKey];
    if (v) {
      working_preferences[q.dimension] = (Array.isArray(v) ? v : [v]).map((x) => optionLabel(q.key, x)).join(", ");
    }
    const n = notes[q.key as QuestionKey];
    if (n) working_notes[q.dimension] = n;
  }
  return {
    role_title: p.role_title,
    years_experience: p.years_experience,
    background: p.background,
    intro: p.intro,
    career_objective: careerObjectiveLabel(p.career_objective),
    strengths: p.strengths,
    strengths_good_at: p.strengths_good_at,
    strengths_example: p.strengths_example,
    development_areas: p.development_areas,
    development_current: p.development_current,
    industries_experience: p.industries_experience,
    industries_interest: p.industries_interest,
    partner_skills: p.partner_skills,
    partner_success: p.partner_success,
    working_preferences,
    working_notes,
  };
}

export function buildPairPrompt(
  you: PairProfilePayload,
  they: PairProfilePayload,
  compatibility: CompatibilityResult,
  insights: PairInsights,
): string {
  const observations = {
    fit_band: compatibility.bandLabel,
    factor_evidence: compatibility.factors.map((f) => ({ factor: f.label, evidence: f.evidence })),
    they_bring_what_you_asked_for: insights.complementaryForYou,
    you_bring_what_they_asked_for: insights.complementaryForThem,
    overlapping_strengths: insights.overlapping,
    shared_industry_interests: insights.sharedInterests,
    capabilities_neither_lists: insights.combinedGaps,
  };
  return [
    "Explain this potential partnership.",
    "",
    wrapUntrusted("profile", "you", JSON.stringify(you, null, 1)),
    wrapUntrusted("profile", "they", JSON.stringify(they, null, 1)),
    "Computed observations (trusted, from the matching engine):",
    JSON.stringify(observations, null, 1),
  ].join("\n");
}

export async function runPairInsight(
  provider: AIProvider,
  you: Profile,
  they: Profile,
  compatibility: CompatibilityResult,
  insights: PairInsights,
): Promise<PairResult> {
  const youPayload = minimalPairProfile(you);
  const theyPayload = minimalPairProfile(they);
  const result = await provider.generate({
    feature: "pair_insight",
    system: PAIR_SYSTEM_PROMPT,
    prompt: buildPairPrompt(youPayload, theyPayload, compatibility, insights),
    schema: pairResultSchema,
    jsonSchema: pairJsonSchema,
    maxTokens: 6000,
    timeoutMs: 60_000,
  });
  const text = [
    result.headline, result.summary, ...result.complementary_strengths, ...result.shared_ground,
    ...result.potential_differences, ...result.discussion_questions,
  ].join("\n");
  const unsupported = findUnsupportedSpecifics(text, [
    JSON.stringify(youPayload),
    JSON.stringify(theyPayload),
    JSON.stringify(insights),
    compatibility.factors.flatMap((f) => f.evidence).join("\n"),
  ]);
  if (unsupported.length) throw new AIGroundingError(unsupported, "The AI explanation referenced details that aren't in either profile, so it wasn't shown.");
  return result;
}

/** Cache key: changes whenever either profile changes. */
export function pairInputVersion(you: Profile, they: Profile): string {
  return `v1:${you.version}:${they.version}`;
}
