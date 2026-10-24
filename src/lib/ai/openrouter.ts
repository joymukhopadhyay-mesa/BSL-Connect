import { AIOutputError, AIProviderError, AIUnavailableError } from "./errors";
import type { AIProvider, StructuredRequest } from "./provider";

/**
 * Google models through the OpenRouter gateway (chat completions API).
 *
 * Policy (programme requirement):
 *  - only `google/…` model ids;
 *  - every request is pinned to Google's own infrastructure with
 *    provider.only = ["google-vertex", "google-ai-studio"] and no fallbacks;
 *  - require_parameters so structured output is never silently dropped.
 * Output uses strict JSON-schema mode and is validated again with Zod.
 * Retries: 429 / 5xx / network up to 3 times with backoff; 402 (out of
 * credits) is never retried.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const GOOGLE_PROVIDERS = ["google-vertex", "google-ai-studio"] as const;

export type OpenRouterOptions = {
  apiKey: string;
  model: string;
  /** Model for audio requests; must also start with `google/`. Defaults to `model`. */
  sttModel?: string;
  reasoningEffort: "minimal" | "low" | "medium" | "high";
  siteUrl?: string;
  fetchImpl?: typeof fetch;
  /** Base backoff in ms (tests set 0). */
  backoffMs?: number;
};

type ChatResponse = {
  model?: string;
  choices?: Array<{ finish_reason?: string | null; message?: { content?: string | null; refusal?: string | null } }>;
  error?: { code?: number; message?: string };
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

export class OpenRouterProvider implements AIProvider {
  readonly name = "openrouter";
  readonly model: string;
  readonly sttModel: string;

  constructor(private readonly options: OpenRouterOptions) {
    const sttModel = options.sttModel ?? options.model;
    if (!options.model.startsWith("google/") || !sttModel.startsWith("google/")) {
      throw new Error("Only google/ models may be used through OpenRouter.");
    }
    this.model = options.model;
    this.sttModel = sttModel;
  }

  buildBody<T>(request: StructuredRequest<T>) {
    const userContent = request.audio
      ? [
          { type: "text", text: request.prompt },
          { type: "input_audio", input_audio: { data: request.audio.data, format: request.audio.format } },
        ]
      : request.prompt;
    return {
      model: request.audio ? this.sttModel : this.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: request.feature, strict: true, schema: request.jsonSchema },
      },
      provider: { only: [...GOOGLE_PROVIDERS], allow_fallbacks: false, require_parameters: true },
      reasoning: { effort: request.reasoningEffort ?? this.options.reasoningEffort },
      max_tokens: request.maxTokens,
    };
  }

  async generate<T>(request: StructuredRequest<T>): Promise<T> {
    const doFetch = this.options.fetchImpl ?? fetch;
    const body = JSON.stringify(this.buildBody(request));
    const backoff = this.options.backoffMs ?? 600;
    let lastError: Error = new AIProviderError();

    for (let attempt = 0; attempt <= 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, backoff * 2 ** (attempt - 1)));
      let res: Response;
      try {
        res = await doFetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
            ...(this.options.siteUrl ? { "HTTP-Referer": this.options.siteUrl } : {}),
            "X-Title": "BSL Connect",
          },
          body,
          signal: AbortSignal.timeout(request.timeoutMs),
        });
      } catch (error) {
        lastError =
          error instanceof Error && error.name === "TimeoutError"
            ? new AIProviderError("The AI service took too long to respond. Please try again.")
            : new AIProviderError();
        continue;
      }

      const json = (await res.json().catch(() => ({}))) as ChatResponse;
      const status = res.ok && json.error ? Number(json.error.code) || 502 : res.status;

      if (status === 402) {
        console.error("[ai] OpenRouter: out of credits (402).");
        throw new AIUnavailableError("AI assistance is paused because the AI account is out of credits.");
      }
      if (status === 401 || status === 403) {
        console.error("[ai] OpenRouter rejected the credentials or request", status);
        throw new AIUnavailableError();
      }
      if (status === 429 || status >= 500 || status === 408) {
        lastError = new AIProviderError(status === 429 ? "The AI service is busy. Please try again in a minute." : undefined);
        continue;
      }
      if (status >= 400) {
        console.error("[ai] OpenRouter request error", status, json.error?.message ?? "");
        throw new AIProviderError("The AI service couldn't process this request.", false);
      }

      const choice = json.choices?.[0];
      if (!choice) throw new AIOutputError();
      if (choice.finish_reason === "length") {
        throw new AIOutputError("The AI response was cut short. Please try again with shorter text.");
      }
      if (choice.message?.refusal || choice.finish_reason === "content_filter") {
        throw new AIOutputError("The AI service declined this request. Try rephrasing your text.");
      }
      const content = choice.message?.content ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        throw new AIOutputError();
      }
      const result = request.schema.safeParse(parsed);
      if (!result.success) throw new AIOutputError();
      if (json.usage?.cost !== undefined) {
        console.info(`[ai] ${request.feature} via ${json.model ?? this.model}: ${json.usage.prompt_tokens ?? 0}+${json.usage.completion_tokens ?? 0} tokens, $${json.usage.cost}`);
      }
      return result.data;
    }
    throw lastError;
  }
}
