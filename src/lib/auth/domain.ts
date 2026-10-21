/**
 * MESA BSL email eligibility.
 *
 * The same rule is enforced in three places:
 *  1. here (client + server action) for immediate feedback and to avoid
 *     sending OTP emails to ineligible addresses,
 *  2. the `bsl_enforce_signup_domain` trigger on auth.users, which blocks
 *     sign-ups made directly against the Auth API,
 *  3. RLS helpers, which only recognise accounts that have a role.
 */
export const STUDENT_EMAIL_DOMAIN = "pg27.mesaschool.co";

// Local part: no "@" and no whitespace. Domain: exactly the student domain.
// Anchored, so "x@pg27.mesaschool.co.evil.com" and "x@sub.pg27.mesaschool.co"
// are rejected — never a substring check.
const STUDENT_EMAIL_PATTERN = /^[^@\s]+@pg27\.mesaschool\.co$/;

export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isAllowedStudentEmail(input: string | null | undefined): boolean {
  if (typeof input !== "string") return false;
  const email = normaliseEmail(input);
  if (email.length > 254) return false;
  return STUDENT_EMAIL_PATTERN.test(email);
}

/**
 * Staff (programme coordinators) may sign in from the wider MESA domain if
 * they are on the staff allowlist. The client only pre-screens; whether a
 * staff address is actually allowed is decided on the server.
 */
const STAFF_EMAIL_PATTERN = /^[^@\s]+@mesaschool\.co$/;

export function mightBeEligible(input: string): boolean {
  const email = normaliseEmail(input);
  return STUDENT_EMAIL_PATTERN.test(email) || STAFF_EMAIL_PATTERN.test(email);
}

export type EmailCheck =
  | { ok: true; email: string }
  | { ok: false; reason: "empty" | "invalid" | "domain" };

export function checkEmail(input: string): EmailCheck {
  const email = normaliseEmail(input);
  if (!email) return { ok: false, reason: "empty" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, reason: "invalid" };
  if (!mightBeEligible(email)) return { ok: false, reason: "domain" };
  return { ok: true, email };
}

export const EMAIL_CHECK_MESSAGES: Record<Exclude<EmailCheck, { ok: true }>["reason"], string> = {
  empty: "Enter your MESA email address.",
  invalid: "That doesn't look like an email address.",
  domain: `Use your MESA student email ending in @${STUDENT_EMAIL_DOMAIN}.`,
};
