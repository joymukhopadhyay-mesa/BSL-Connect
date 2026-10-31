/**
 * Map database error codes (raised by RPCs as P0001 messages) to friendly,
 * non-technical copy. Unknown errors get a generic message — raw database
 * errors are never shown to users.
 */
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "Your session has ended. Please sign in again.",
  FORBIDDEN: "You don't have permission to do that.",
  SELF_ACTION: "You can't do that to your own profile.",
  INVALID_DECISION: "That action isn't available.",
  PROFILE_NOT_ACTIVE: "Publish your profile to start discovering partners.",
  PROFILE_INCOMPLETE: "Some required details are missing. Complete them before publishing.",
  TARGET_UNAVAILABLE: "This profile is no longer available.",
  ALREADY_LIKED: "You've already added this student to your shortlist.",
  ALREADY_PARTNERED: "A finalised partnership already exists for one of you.",
  MATCH_EXISTS: "You have a mutual match with this student. Decline the match instead.",
  MATCH_NOT_FOUND: "That match couldn't be found.",
  MATCH_NOT_OPEN: "This match is no longer open.",
  MATCH_NOT_FINALISED: "Only finalised partnerships can be cancelled.",
  DUPLICATE_CANDIDATE: "Each student can appear only once in your ranking.",
  NOT_IN_SHORTLIST: "You can only rank students on your shortlist.",
  TOO_MANY_CANDIDATES: "Your shortlist is too long to rank.",
  REASON_REQUIRED: "Please add a short explanation.",
  PHOTO_NOT_UPLOADED: "Upload a photo first.",
  PHOTO_CONFIRMATION_REQUIRED: "Confirm that the photo depicts you.",
  NOT_A_STUDENT: "This action is only available to students.",
  INVALID_CATEGORY: "Choose a reason for the report.",
  EXPLANATION_TOO_LONG: "Please shorten your explanation to 1,000 characters.",
  RATE_LIMITED: "You've submitted several reports today. Please contact the programme team directly.",
  REPORT_NOT_FOUND: "That report couldn't be found.",
  INVALID_STATUS: "That status isn't valid.",
  SELF_MODERATION: "Another administrator needs to handle anything involving your own profile.",
  DELETION_NOT_REQUESTED: "The student hasn't requested account removal.",
  PHOTO_INVALID: "Use a JPEG, PNG or WebP image under 4 MB.",
  DELETION_REQUESTED: "You've requested account removal, so your profile can't be published.",
  INVALID_PROBLEM_STATEMENT: "Choose different problem statements from the list for each priority.",
  PROBLEM_STATEMENTS_LOCKED: "Problem statement selections closed on 1 November at 10 am IST, so your ranking can no longer change.",
  EMAIL_DOMAIN_NOT_ALLOWED: "BSL Connect accepts @pg27.mesaschool.co email addresses only.",
};

export const GENERIC_ERROR = "Something went wrong. Please try again.";

export function errorCodeFrom(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  const code = message.trim().split(/\s/)[0] ?? "";
  return /^[A-Z_]+$/.test(code) && code in MESSAGES ? code : null;
}

export function friendlyError(error: unknown): string {
  const code = errorCodeFrom(error);
  return code ? MESSAGES[code]! : GENERIC_ERROR;
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; code?: string | null; fieldErrors?: Record<string, string> };
