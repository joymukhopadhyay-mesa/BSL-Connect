import { z } from "zod";
import { AIGroundingError } from "./errors";
import { findUnsupportedSpecifics } from "./grounding";
import type { AIProvider } from "./provider";
import { UNTRUSTED_DATA_RULE, wrapUntrusted } from "./untrusted";

/** Profile sections the coach can help with, and what good looks like for each. */
export const COACH_FIELDS = {
  intro: {
    label: "Introduction",
    guidance: "Two or three sentences (at most 80 words) on how the student works and what they bring to a team.",
    maxChars: 700,
  },
  background: {
    label: "Professional background",
    guidance: "Two or three sentences summarising their background, using only roles and experience they mention.",
    maxChars: 700,
  },
  strengths_good_at: {
    label: "What I'm particularly good at",
    guidance: "Turn vague strengths into specific, observable capabilities. At most 70 words.",
    maxChars: 700,
  },
  strengths_example: {
    label: "A concrete example",
    guidance:
      "Tighten the example into situation, action and outcome — using only what the student wrote. If no outcome is given, do not add one.",
    maxChars: 900,
  },
  development_current: {
    label: "Skills I'm developing",
    guidance: "Frame development areas constructively, as skills being actively built. Never as weaknesses. At most 60 words.",
    maxChars: 700,
  },
  partner_success: {
    label: "What would make the partnership successful",
    guidance: "Make the student's expectations clear and specific. At most 60 words.",
    maxChars: 700,
  },
} as const;

export type CoachField = keyof typeof COACH_FIELDS;
export const COACH_FIELD_KEYS = Object.keys(COACH_FIELDS) as [CoachField, ...CoachField[]];

export const coachRequestSchema = z.object({
  field: z.enum(COACH_FIELD_KEYS),
  text: z.string().trim().min(12, "Write a sentence or two first, then ask for suggestions.").max(2000),
  context: z
    .object({
      role_title: z.string().max(120).nullish(),
      strengths: z.array(z.string().max(48)).max(12).nullish(),
      development_areas: z.array(z.string().max(48)).max(10).nullish(),
      career_objectives: z.array(z.string().max(80)).max(6).nullish(),
    })
    .default({}),
});
export type CoachRequest = z.infer<typeof coachRequestSchema>;

export const coachResultSchema = z.object({
  suggestion: z.string().trim().min(1).max(1200),
  rationale: z.string().trim().max(400),
  suggested_tags: z.array(z.string().trim().min(1).max(40)).max(6),
  missing_information: z.array(z.string().trim().min(1).max(240)).max(4),
  needs_more_detail: z.boolean(),
});
export type CoachResult = z.infer<typeof coachResultSchema>;

export const coachJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["suggestion", "rationale", "suggested_tags", "missing_information", "needs_more_detail"],
  properties: {
    suggestion: { type: "string", description: "The improved text, in the student's first-person voice." },
    rationale: { type: "string", description: "One sentence on what changed and why." },
    suggested_tags: {
      type: "array",
      items: { type: "string" },
      description: "Up to 5 short skill tags directly supported by the student's text.",
    },
    missing_information: {
      type: "array",
      items: { type: "string" },
      description: "Up to 3 concrete details the student could add to strengthen this section.",
    },
    needs_more_detail: { type: "boolean" },
  },
} as const;

export const COACH_SYSTEM_PROMPT = `You are the profile coach inside BSL Connect, the partner-matching tool for MESA School of Business students taking part in Business Strategy Labs (BSL). Students pair up to work on real problem statements from startups. You help a student rewrite one section of their professional profile so it is clear, specific and concise, so that potential partners understand how they work.

Rules:
1. Use only facts stated in the student's text or context. Never add employers, companies, clients, job titles, tools, certifications, numbers, metrics, results, dates or experiences that are not stated.
2. If a claim has no supporting evidence in the text, do not invent evidence. Instead, list the concrete detail the student could add in missing_information.
3. Keep the student's voice: first person, professional and warm. No hype, clichés or buzzwords.
4. Describe development areas constructively, as skills being built — never as weaknesses or a judgement of ability.
5. suggested_tags must be short skill names directly supported by the text.
6. If the text is too short or vague to improve without inventing details, set needs_more_detail to true, return a suggestion that only tidies the original wording, and say what to add in missing_information.
7. ${UNTRUSTED_DATA_RULE}

Respond only with the JSON object described by the schema.`;

export function buildCoachPrompt(req: CoachRequest, strict = false): string {
  const field = COACH_FIELDS[req.field];
  const ctx = req.context ?? {};
  // Minimal context: no name, email, cohort or identifiers.
  const contextLines = [
    ctx.role_title ? `Current or most recent role: ${ctx.role_title}` : null,
    ctx.strengths?.length ? `Strength tags: ${ctx.strengths.join(", ")}` : null,
    ctx.development_areas?.length ? `Development tags: ${ctx.development_areas.join(", ")}` : null,
    ctx.career_objectives?.length ? `Career objectives: ${ctx.career_objectives.join("; ")}` : null,
  ].filter(Boolean);

  return [
    `Section: ${field.label}`,
    `What good looks like: ${field.guidance}`,
    strict
      ? "Important: a previous draft added names or numbers the student did not write. Use no proper nouns or numbers unless they appear verbatim in the student's text."
      : null,
    "",
    wrapUntrusted("student_text", req.field, req.text),
    contextLines.length ? wrapUntrusted("student_context", "context", contextLines.join("\n")) : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function sourcesFor(req: CoachRequest): string[] {
  const ctx = req.context ?? {};
  return [req.text, ctx.role_title ?? "", ...(ctx.strengths ?? []), ...(ctx.development_areas ?? []), ...(ctx.career_objectives ?? [])];
}

/**
 * Generate a suggestion and verify it is grounded. If the first draft adds
 * unsupported specifics, try once more with a stricter instruction; if that
 * also fails, refuse rather than show invented detail.
 */
export async function runProfileCoach(provider: AIProvider, req: CoachRequest): Promise<CoachResult> {
  const sources = sourcesFor(req);
  let unsupported: string[] = [];
  for (const strict of [false, true]) {
    const result = await provider.generate({
      feature: "profile_coach",
      system: COACH_SYSTEM_PROMPT,
      prompt: buildCoachPrompt(req, strict),
      schema: coachResultSchema,
      jsonSchema: coachJsonSchema,
      maxTokens: 4000,
      timeoutMs: 45_000,
    });
    unsupported = findUnsupportedSpecifics(
      [result.suggestion, ...result.suggested_tags].join("\n"),
      sources,
    );
    if (unsupported.length === 0) {
      return {
        ...result,
        suggestion: result.suggestion.slice(0, COACH_FIELDS[req.field].maxChars),
        suggested_tags: Array.from(new Set(result.suggested_tags)).slice(0, 5),
      };
    }
  }
  throw new AIGroundingError(unsupported);
}
