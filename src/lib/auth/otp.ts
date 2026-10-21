import "server-only";
import { hashIp, hashSessionToken, hashSignInCode, newSessionToken, newSignInCode } from "@/lib/auth/crypto";
import { SESSION_TTL_SECONDS } from "@/lib/auth/cookies";
import { systemQuery } from "@/lib/db/neon";
import { sendSignInCode } from "@/lib/email/resend";
import { EMAIL_CHECK_MESSAGES } from "./domain";

export type OtpFailure = {
  ok: false;
  reason: "domain" | "invalid" | "expired" | "locked" | "rate_limited" | "too_soon" | "email" | "unknown";
  error: string;
};

/** Issue a code (eligibility and rate limits are enforced in auth.request_otp), then email it. */
export async function requestSignInCode(email: string, ip: string | null): Promise<{ ok: true } | OtpFailure> {
  const code = newSignInCode();
  const [row] = await systemQuery<{ r: { status: string; id?: string; retry_after?: number } }>(
    "select auth.request_otp($1, $2, $3, 600) as r",
    [email, hashSignInCode(email, code), hashIp(ip)],
  );
  const r = row?.r;
  switch (r?.status) {
    case "ok":
      break;
    case "not_allowed":
      return { ok: false, reason: "domain", error: EMAIL_CHECK_MESSAGES.domain };
    case "invalid":
      return { ok: false, reason: "invalid", error: EMAIL_CHECK_MESSAGES.invalid };
    case "too_soon":
      return { ok: false, reason: "too_soon", error: `Please wait ${r.retry_after ?? 60} seconds before requesting another code.` };
    case "rate_limited":
      return { ok: false, reason: "rate_limited", error: "Too many codes requested. Please try again in an hour." };
    default:
      return { ok: false, reason: "unknown", error: "We couldn't start sign-in. Please try again." };
  }

  const sent = await sendSignInCode(email, code);
  if (!sent.ok) {
    // Remove the unsent code so the 60-second resend gap doesn't block a retry.
    await systemQuery("select auth.discard_otp($1)", [r.id]);
    return { ok: false, reason: "email", error: `${sent.error} Please try again in a moment.` };
  }
  return { ok: true };
}

/** Verify a code; on success returns a new session token (store it in the cookie). */
export async function verifySignInCode(
  email: string,
  code: string,
  userAgent: string | null,
): Promise<{ ok: true; token: string; userId: string } | OtpFailure> {
  const token = newSessionToken();
  let r: { status: string; attempts_left?: number; user_id?: string } | undefined;
  try {
    const [row] = await systemQuery<{ r: { status: string; attempts_left?: number; user_id?: string } }>(
      "select auth.verify_otp($1, $2, $3, $4, $5) as r",
      [email, hashSignInCode(email, code), hashSessionToken(token), SESSION_TTL_SECONDS, userAgent],
    );
    r = row?.r;
  } catch (error) {
    if (error instanceof Error && error.message.includes("EMAIL_DOMAIN_NOT_ALLOWED")) {
      return { ok: false, reason: "domain", error: EMAIL_CHECK_MESSAGES.domain };
    }
    throw error;
  }
  switch (r?.status) {
    case "ok":
      return { ok: true, token, userId: r.user_id! };
    case "invalid":
      return {
        ok: false,
        reason: "invalid",
        error: r.attempts_left
          ? `That code isn't right. ${r.attempts_left} attempt${r.attempts_left === 1 ? "" : "s"} left.`
          : "That code isn't right. Request a new code.",
      };
    case "locked":
      return { ok: false, reason: "locked", error: "Too many incorrect attempts. Request a new code." };
    case "expired":
      return { ok: false, reason: "expired", error: "This code has expired or was already used. Request a new one." };
    default:
      return { ok: false, reason: "unknown", error: "We couldn't verify the code. Please try again." };
  }
}

export async function revokeSession(token: string): Promise<void> {
  await systemQuery("select auth.revoke_session($1)", [hashSessionToken(token)]);
}

export async function sessionUser(token: string): Promise<{ user_id: string; email: string } | null> {
  const rows = await systemQuery<{ user_id: string; email: string }>("select * from auth.session_user($1)", [hashSessionToken(token)]);
  return rows[0] ?? null;
}
