import { z } from "zod";
import { INDUSTRIES, MAX_CAREER_OBJECTIVES, MAX_CAREER_OBJECTIVE_LENGTH, PARTNER_QUALITIES, QUESTIONS, QUESTION_KEYS } from "./options";

/**
 * Server-side validation for each onboarding step. Drafts may be saved with
 * blank fields (students can return later); the database refuses to publish
 * an incomplete profile. These schemas enforce types, lengths and closed
 * vocabularies so nothing malformed reaches the database.
 */

const text = (max: number) =>
  z
    .string()
    .max(max * 2) // tolerate whitespace before trimming
    .transform((s) => s.replace(/\r\n/g, "\n").trim())
    .pipe(z.string().max(max))
    .transform((s) => (s === "" ? null : s));

const optionalText = (max: number) => text(max).nullable().optional().transform((v) => v ?? null);

/** Tags: trimmed, de-duplicated case-insensitively, bounded. */
const tags = (maxItems: number, maxLen = 48) =>
  z
    .array(z.string())
    .max(maxItems * 2)
    .transform((arr) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of arr) {
        const t = raw.replace(/\s+/g, " ").trim();
        const key = t.toLowerCase();
        if (!t || seen.has(key)) continue;
        seen.add(key);
        out.push(t);
      }
      return out;
    })
    .pipe(z.array(z.string().min(1).max(maxLen)).max(maxItems));

const industries = (maxItems: number) =>
  z.array(z.enum(INDUSTRIES)).max(maxItems).transform((a) => Array.from(new Set(a)));

export const basicsSchema = z.object({
  full_name: optionalText(120),
  cohort: optionalText(60),
  role_title: optionalText(120),
  background: optionalText(700),
  years_experience: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 50) {
        ctx.addIssue({ code: "custom", message: "Enter a number of years between 0 and 50." });
        return z.NEVER;
      }
      return Math.round(n * 10) / 10;
    }),
  career_objectives: tags(MAX_CAREER_OBJECTIVES, MAX_CAREER_OBJECTIVE_LENGTH),
  intro: optionalText(700),
});

export const strengthsSchema = z.object({
  strengths: tags(12),
  strengths_good_at: optionalText(700),
  strengths_problems: optionalText(700),
  strengths_example: optionalText(900),
});

export const developmentSchema = z.object({
  development_areas: tags(10),
  development_current: optionalText(700),
  development_complement: optionalText(700),
  development_help: optionalText(700),
});

export const industriesSchema = z.object({
  industries_experience: industries(15),
  industries_experience_detail: optionalText(700),
  industries_interest: industries(15),
});

const answerSchema = z.union([z.string().max(40), z.array(z.string().max(40)).max(6)]);

export const questionnaireSchema = z
  .object({
    answers: z.record(z.string(), answerSchema).default({}),
    notes: z.record(z.string(), z.string().max(600)).default({}),
  })
  .transform((q, ctx) => {
    const answers: Record<string, string | string[]> = {};
    const notes: Record<string, string> = {};
    for (const question of QUESTIONS) {
      const raw = q.answers[question.key];
      const allowed = new Set(question.options.map((o) => o.value));
      if (raw !== undefined) {
        if (question.type === "single") {
          if (typeof raw !== "string" || (raw !== "" && !allowed.has(raw))) {
            ctx.addIssue({ code: "custom", path: ["answers", question.key], message: "Choose one of the options." });
            continue;
          }
          if (raw) answers[question.key] = raw;
        } else {
          const values = Array.isArray(raw) ? Array.from(new Set(raw)) : [];
          if (values.some((v) => !allowed.has(v))) {
            ctx.addIssue({ code: "custom", path: ["answers", question.key], message: "Choose from the options." });
            continue;
          }
          if (question.maxSelections && values.length > question.maxSelections) {
            ctx.addIssue({
              code: "custom",
              path: ["answers", question.key],
              message: `Choose up to ${question.maxSelections}.`,
            });
            continue;
          }
          if (values.length) answers[question.key] = values;
        }
      }
      const note = q.notes[question.key]?.trim();
      if (note) notes[question.key] = note.slice(0, 300);
    }
    // Unknown keys are dropped silently above; nothing else is stored.
    return { answers, notes };
  });

export const questionnaireStepSchema = z.object({ questionnaire: questionnaireSchema });

export const partnerSchema = z.object({
  partner_skills: tags(10),
  partner_industries: industries(15),
  partner_qualities: z
    .array(z.enum(PARTNER_QUALITIES))
    .max(8)
    .transform((a) => Array.from(new Set(a))),
  partner_success: optionalText(700),
});

export const publishSchema = z.object({
  details_confirmed: z.literal(true, { message: "Confirm that your details are accurate." }),
  photo_confirmed: z.literal(true, { message: "Confirm that your photo depicts you." }),
  visibility_acknowledged: z.literal(true, {
    message: "Confirm that you understand who can see your profile.",
  }),
});

export const STEP_SCHEMAS = {
  1: basicsSchema,
  2: strengthsSchema,
  3: developmentSchema,
  4: industriesSchema,
  5: questionnaireStepSchema,
  6: partnerSchema,
} as const;

export type EditableStep = keyof typeof STEP_SCHEMAS;

export function isEditableStep(n: number): n is EditableStep {
  return n in STEP_SCHEMAS;
}

export const ONBOARDING_STEPS = [
  { step: 1, title: "About you", short: "Basics" },
  { step: 2, title: "Your strengths", short: "Strengths" },
  { step: 3, title: "Where a partner helps", short: "Development" },
  { step: 4, title: "Industries", short: "Industries" },
  { step: 5, title: "How you work", short: "Working style" },
  { step: 6, title: "Your ideal partner", short: "Preferences" },
  { step: 7, title: "Profile photo", short: "Photo" },
  { step: 8, title: "Review and publish", short: "Review" },
] as const;

export { QUESTION_KEYS };
