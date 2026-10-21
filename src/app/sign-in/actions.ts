"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "@/lib/auth/cookies";
import { checkEmail, EMAIL_CHECK_MESSAGES } from "@/lib/auth/domain";
import { requestSignInCode as issueCode, revokeSession, verifySignInCode as checkCode } from "@/lib/auth/otp";
import { safeNextPath } from "@/lib/auth/redirect";
import { homeFor, type MyStatus } from "@/lib/data/session";
import { userDb } from "@/lib/db/neon";
import { isDatabaseConfigured } from "@/lib/env";

export type AuthActionResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; error: string; reason?: string };

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Step 1: validate the address on the server (domain or staff allowlist,
 * enforced again inside auth.request_otp), then email a code via Resend.
 */
export async function requestSignInCode(rawEmail: string): Promise<AuthActionResult> {
  const check = checkEmail(String(rawEmail ?? ""));
  if (!check.ok) return { ok: false, reason: check.reason, error: EMAIL_CHECK_MESSAGES[check.reason] };
  if (!isDatabaseConfigured()) return { ok: false, reason: "config", error: "Sign-in isn't configured yet." };
  try {
    const res = await issueCode(check.email, await clientIp());
    return res.ok ? { ok: true } : { ok: false, reason: res.reason, error: res.error };
  } catch (error) {
    console.error("[auth] request code failed", error instanceof Error ? error.message : error);
    return { ok: false, reason: "unknown", error: "We couldn't start sign-in. Please try again." };
  }
}

const codeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your email.");

/** Step 2: verify the code, then set an HttpOnly session cookie. */
export async function verifySignInCode(rawEmail: string, rawCode: string, next?: string | null): Promise<AuthActionResult> {
  const check = checkEmail(String(rawEmail ?? ""));
  if (!check.ok) return { ok: false, reason: "invalid", error: EMAIL_CHECK_MESSAGES[check.reason] };
  const code = codeSchema.safeParse(rawCode);
  if (!code.success) return { ok: false, reason: "invalid", error: "Enter the 6-digit code from your email." };

  try {
    const ua = (await headers()).get("user-agent");
    const res = await checkCode(check.email, code.data, ua);
    if (!res.ok) return { ok: false, reason: res.reason, error: res.error };
    await setSessionCookie(res.token);
    const status = await userDb(res.userId).rpc<MyStatus>("my_status");
    return { ok: true, redirectTo: safeNextPath(next) ?? homeFor(status) };
  } catch (error) {
    console.error("[auth] verify failed", error instanceof Error ? error.message : error);
    return { ok: false, reason: "unknown", error: "We couldn't verify the code. Please try again." };
  }
}

export async function signOut(): Promise<never> {
  try {
    const token = await readSessionToken();
    if (token && isDatabaseConfigured()) await revokeSession(token);
  } catch {
    // Signing out locally still succeeds below.
  }
  await clearSessionCookie();
  redirect("/sign-in");
}
