import type { z } from "zod";

/**
 * Provider abstraction for runtime AI features. The rest of the app only
 * depends on this interface, so the provider or model can change through
 * configuration without touching feature code.
 *
 * Providers receive a system prompt (trusted, written by us) and a user
 * prompt (contains untrusted student text, already wrapped and escaped),
 * and must return output that validates against `schema`. They have no
 * tools and no database access.
 */
export type StructuredRequest<T> = {
  /** Feature name, used for logging only. */
  feature: "profile_coach" | "pair_insight";
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** JSON Schema sent to the provider's structured-output mode. */
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
};

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generate<T>(request: StructuredRequest<T>): Promise<T>;
}

export type AIStatus =
  | { available: true; provider: string; model: string }
  | { available: false; reason: "disabled" | "missing_credentials" | "unknown_provider" };
