import { describe, expect, it, vi } from "vitest";
import { coachJsonSchema, coachResultSchema } from "@/lib/ai/coach";
import { AIOutputError, AIProviderError, AIUnavailableError } from "@/lib/ai/errors";
import { OpenRouterProvider } from "@/lib/ai/openrouter";

const request = {
  feature: "profile_coach" as const,
  system: "system prompt",
  prompt: "user prompt",
  schema: coachResultSchema,
  jsonSchema: coachJsonSchema,
  maxTokens: 4000,
  timeoutMs: 5000,
};

const good = { suggestion: "Improved.", rationale: "Clearer.", suggested_tags: [], missing_information: [], needs_more_detail: false };

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const ok = (content: unknown) =>
  reply(200, {
    model: "google/gemini-3.7-flash",
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
    usage: { cost: 0.0001 },
  });

function provider(fetchImpl: unknown) {
  return new OpenRouterProvider({
    apiKey: "k",
    model: "google/gemini-3.7-flash",
    reasoningEffort: "low",
    fetchImpl: fetchImpl as typeof fetch,
    backoffMs: 0,
  });
}

describe("OpenRouter provider", () => {
  it("pins every request to Google infrastructure with strict structured output", async () => {
    const fetchImpl = vi.fn(async () => ok(good));
    await provider(fetchImpl).generate(request);
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("google/gemini-3.7-flash");
    expect(body.provider).toEqual({ only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false, require_parameters: true });
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0]).toEqual({ role: "system", content: "system prompt" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("refuses to construct with a non-Google model", () => {
    expect(() => new OpenRouterProvider({ apiKey: "k", model: "openai/gpt-5", reasoningEffort: "low" })).toThrow(/google/);
  });

  it("retries 429 and 5xx, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply(429, { error: { code: 429, message: "slow down" } }))
      .mockResolvedValueOnce(reply(503, { error: { code: 503, message: "no provider" } }))
      .mockResolvedValueOnce(ok(good));
    const res = await provider(fetchImpl).generate(request);
    expect(res.suggestion).toBe("Improved.");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up after three retries", async () => {
    const fetchImpl = vi.fn(async () => reply(502, { error: { code: 502, message: "down" } }));
    await expect(provider(fetchImpl).generate(request)).rejects.toBeInstanceOf(AIProviderError);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("never retries 402 (out of credits) and reports AI as unavailable", async () => {
    const fetchImpl = vi.fn(async () => reply(402, { error: { code: 402, message: "Insufficient credits" } }));
    await expect(provider(fetchImpl).generate(request)).rejects.toBeInstanceOf(AIUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats an error object inside a 200 response as an error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { error: { code: 502, message: "upstream failed" } }))
      .mockResolvedValueOnce(ok(good));
    await expect(provider(fetchImpl).generate(request)).resolves.toMatchObject({ suggestion: "Improved." });
  });

  it("rejects truncated or schema-invalid output", async () => {
    const truncated = vi.fn(async () => reply(200, { choices: [{ finish_reason: "length", message: { content: "{" } }] }));
    await expect(provider(truncated).generate(request)).rejects.toBeInstanceOf(AIOutputError);
    const invalid = vi.fn(async () => ok({ suggestion: 1 }));
    await expect(provider(invalid).generate(request)).rejects.toBeInstanceOf(AIOutputError);
  });
});
