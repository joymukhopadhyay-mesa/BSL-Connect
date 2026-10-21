import { CAREER_OBJECTIVES, INDUSTRIES, PARTNER_QUALITIES, QUESTIONS, SKILL_SUGGESTIONS } from "@/lib/profile/options";

/**
 * Deterministic guard against fabricated specifics.
 *
 * The prompt tells the model not to invent facts; this check verifies it.
 * Any number (years, %, amounts) or proper-noun-like term (a capitalised
 * word that isn't at the start of a sentence, e.g. a company or tool name)
 * in the AI output must also appear in the source text the student wrote.
 * Terms from the app's own vocabularies and ordinary sentence-initial words
 * are allowed. Matching is case-insensitive.
 */

const VOCABULARY = new Set(
  [
    ...SKILL_SUGGESTIONS,
    ...INDUSTRIES,
    ...PARTNER_QUALITIES,
    ...CAREER_OBJECTIVES.map((c) => c.label),
    ...QUESTIONS.flatMap((q) => q.options.map((o) => o.label)),
    "BSL", "MESA", "Business Strategy Labs", "I", "I'm", "I've", "I'd", "I'll", "You", "They", "We",
  ]
    .flatMap((t) => t.split(/[\s,/()-]+/))
    .map((t) => t.toLowerCase())
    .filter(Boolean),
);

function normalise(s: string): string {
  return s.toLowerCase().replace(/[’']/g, "'");
}

function tokens(s: string): string[] {
  return s.split(/[^A-Za-z0-9&+.'’%-]+/).filter(Boolean);
}

/** Numbers like 3, 3.5, 40%, 1,200, 10x, 2023. */
const NUMBER = /\d[\d,.]*(?:%|x|k|m|bn)?/gi;

export function findUnsupportedSpecifics(output: string, sources: string[]): string[] {
  const source = normalise(sources.join("\n"));
  const sourceTokens = new Set(tokens(source).map((t) => t.replace(/[.,]+$/, "")));
  const flagged = new Set<string>();

  for (const match of output.match(NUMBER) ?? []) {
    const n = match.replace(/[.,]+$/, "").toLowerCase();
    if (!source.includes(n)) flagged.add(match.replace(/[.,]+$/, ""));
  }

  // Split into sentences so the first word of each can be ignored.
  const sentences = output.split(/(?<=[.!?:;])\s+|\n+/);
  for (const sentence of sentences) {
    const words = tokens(sentence);
    words.forEach((raw, index) => {
      const word = raw.replace(/^[.'’-]+|[.,'’%-]+$/g, "");
      if (!word || index === 0) return;
      const isProperLike = /^[A-Z][a-zA-Z&+.-]*$/.test(word) || /^[A-Z0-9]{2,}$/.test(word) || /[a-z][A-Z]/.test(word);
      if (!isProperLike) return;
      const lower = normalise(word);
      if (VOCABULARY.has(lower) || sourceTokens.has(lower) || source.includes(lower)) return;
      flagged.add(word);
    });
  }
  return Array.from(flagged).sort();
}
