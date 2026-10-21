import { QUESTION_KEYS } from "./options";
import type { Profile } from "./types";

/**
 * Mirror of private.profile_missing_fields() in the database, used for UI
 * hints and progress. The database remains the authority: publication is
 * rejected there if anything is missing. tests/unit/completion.test.ts and
 * tests/db keep the two in agreement.
 */
export type CompletionInput = Pick<
  Profile,
  | "full_name" | "role_title" | "background" | "career_objective" | "intro" | "strengths"
  | "strengths_good_at" | "development_areas" | "development_current" | "industries_interest"
  | "questionnaire" | "partner_skills" | "partner_qualities" | "photo_path" | "photo_confirmed"
  | "details_confirmed" | "visibility_acknowledged"
>;

const blank = (v: string | null | undefined) => !v || v.trim() === "";
const empty = (v: unknown[] | null | undefined) => !v || v.length === 0;

export function missingFields(p: CompletionInput): string[] {
  const missing: string[] = [];
  if (blank(p.full_name)) missing.push("full_name");
  if (blank(p.role_title)) missing.push("role_title");
  if (blank(p.background)) missing.push("background");
  if (blank(p.career_objective)) missing.push("career_objective");
  if (blank(p.intro)) missing.push("intro");
  if (empty(p.strengths)) missing.push("strengths");
  if (blank(p.strengths_good_at)) missing.push("strengths_good_at");
  if (empty(p.development_areas)) missing.push("development_areas");
  if (blank(p.development_current)) missing.push("development_current");
  if (empty(p.industries_interest)) missing.push("industries_interest");
  const answers = p.questionnaire?.answers ?? {};
  for (const key of QUESTION_KEYS) {
    const v = answers[key];
    const ok = (typeof v === "string" && v.trim() !== "") || (Array.isArray(v) && v.length > 0);
    if (!ok) missing.push(`questionnaire.${key}`);
  }
  if (empty(p.partner_skills)) missing.push("partner_skills");
  if (empty(p.partner_qualities)) missing.push("partner_qualities");
  if (!p.photo_path) missing.push("photo");
  if (!p.photo_confirmed) missing.push("photo_confirmed");
  if (!p.details_confirmed) missing.push("details_confirmed");
  if (!p.visibility_acknowledged) missing.push("visibility_acknowledged");
  return missing;
}

/** Which onboarding step owns each required field. */
export const FIELD_STEP: Record<string, number> = {
  full_name: 1, role_title: 1, background: 1, career_objective: 1, intro: 1,
  strengths: 2, strengths_good_at: 2,
  development_areas: 3, development_current: 3,
  industries_interest: 4,
  partner_skills: 6, partner_qualities: 6,
  photo: 7, photo_confirmed: 7,
  details_confirmed: 8, visibility_acknowledged: 8,
};

export function stepForField(field: string): number {
  if (field.startsWith("questionnaire.")) return 5;
  return FIELD_STEP[field] ?? 1;
}

export function stepIsComplete(step: number, p: CompletionInput): boolean {
  return missingFields(p).every((f) => stepForField(f) !== step);
}

/** 0–100, counting the confirmation step only once everything else is done. */
export function completionPercent(p: CompletionInput): number {
  const totalRequired = 10 + QUESTION_KEYS.length + 2 + 2 + 2;
  return Math.round(((totalRequired - missingFields(p).length) / totalRequired) * 100);
}

export const FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  role_title: "Current or most recent role",
  background: "Professional background",
  career_objective: "Career objective",
  intro: "Introduction",
  strengths: "Strength tags",
  strengths_good_at: "What you're good at",
  development_areas: "Development areas",
  development_current: "Skills you're developing",
  industries_interest: "Industries of interest",
  partner_skills: "Skills you'd like in a partner",
  partner_qualities: "Qualities you value",
  photo: "Profile photo",
  photo_confirmed: "Photo confirmation",
  details_confirmed: "Accuracy confirmation",
  visibility_acknowledged: "Visibility acknowledgement",
};

export function fieldLabel(field: string): string {
  if (field.startsWith("questionnaire.")) return "Working-style questionnaire";
  return FIELD_LABELS[field] ?? field;
}
