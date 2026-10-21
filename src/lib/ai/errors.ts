/** Error types the AI layer surfaces to route handlers. Messages are safe to show. */

export class AIUnavailableError extends Error {
  readonly code = "AI_UNAVAILABLE";
  constructor(message = "AI assistance isn't available right now. Everything else in BSL Connect works as normal.") {
    super(message);
  }
}

export class AIProviderError extends Error {
  readonly code = "AI_PROVIDER_ERROR";
  constructor(
    message = "The AI service didn't respond. Please try again in a moment.",
    readonly retryable = true,
  ) {
    super(message);
  }
}

export class AIOutputError extends Error {
  readonly code = "AI_INVALID_OUTPUT";
  constructor(message = "The AI response couldn't be used. Please try again.") {
    super(message);
  }
}

export class AIGroundingError extends Error {
  readonly code = "AI_UNGROUNDED";
  constructor(
    readonly unsupported: string[],
    message = "The suggestion included details you haven't provided, so we didn't show it. Add more detail to your text and try again.",
  ) {
    super(message);
  }
}

export class AIRateLimitedError extends Error {
  readonly code = "AI_RATE_LIMITED";
  constructor(message = "You've reached the hourly limit for AI suggestions. Please try again later.") {
    super(message);
  }
}

export type AIErrorCode =
  | AIUnavailableError["code"]
  | AIProviderError["code"]
  | AIOutputError["code"]
  | AIGroundingError["code"]
  | AIRateLimitedError["code"];

export function isAIError(
  e: unknown,
): e is AIUnavailableError | AIProviderError | AIOutputError | AIGroundingError | AIRateLimitedError {
  return (
    e instanceof AIUnavailableError ||
    e instanceof AIProviderError ||
    e instanceof AIOutputError ||
    e instanceof AIGroundingError ||
    e instanceof AIRateLimitedError
  );
}
