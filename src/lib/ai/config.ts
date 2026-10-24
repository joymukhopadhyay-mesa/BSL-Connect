import { getSiteUrl } from "@/lib/env";
import { OpenRouterProvider } from "./openrouter";
import type { AIProvider, AIStatus } from "./provider";

export const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.7-flash";
export const DEFAULT_OPENROUTER_STT_MODEL = "google/gemini-3.7-flash";
const EFFORTS = ["minimal", "low", "medium", "high"] as const;
type Effort = (typeof EFFORTS)[number];

type Env = Record<string, string | undefined>;

/** Resolve the configured provider. Returns null (never throws) when AI is off. */
export function resolveAIProvider(env: Env = process.env): { provider: AIProvider | null; status: AIStatus } {
  const name = (env.AI_PROVIDER ?? "openrouter").trim().toLowerCase();
  if (name === "none" || name === "off" || name === "disabled") {
    return { provider: null, status: { available: false, reason: "disabled" } };
  }
  if (name !== "openrouter") {
    return { provider: null, status: { available: false, reason: "unknown_provider" } };
  }
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return { provider: null, status: { available: false, reason: "missing_credentials" } };
  }
  const model = env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
  if (!model.startsWith("google/")) {
    // Programme policy: Google models only.
    return { provider: null, status: { available: false, reason: "unknown_provider" } };
  }
  const effortRaw = (env.OPENROUTER_REASONING_EFFORT ?? "low").trim() as Effort;
  const reasoningEffort: Effort = EFFORTS.includes(effortRaw) ? effortRaw : "low";
  // Voice dictation model; a non-Google value is ignored rather than trusted.
  const sttCandidate = env.OPENROUTER_STT_MODEL?.trim();
  const sttModel = sttCandidate?.startsWith("google/") ? sttCandidate : DEFAULT_OPENROUTER_STT_MODEL;
  const provider = new OpenRouterProvider({ apiKey, model, sttModel, reasoningEffort, siteUrl: getSiteUrl() });
  return { provider, status: { available: true, provider: provider.name, model } };
}

let cached: ReturnType<typeof resolveAIProvider> | null = null;

export function getAI(): ReturnType<typeof resolveAIProvider> {
  if (!cached) cached = resolveAIProvider();
  return cached;
}

export function getAIStatus(): AIStatus {
  return getAI().status;
}
