import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

/**
 * Sign-in secrets. Codes are stored only as HMAC-SHA256(AUTH_SECRET, email:code)
 * and session tokens only as SHA-256(token), so a database leak does not
 * reveal anything that can be used to sign in.
 */

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (at least 32 characters).");
  return s;
}

/** Six-digit code from a CSPRNG, uniformly distributed. */
export function newSignInCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashSignInCode(email: string, code: string, key = secret()): string {
  return createHmac("sha256", key).update(`${email.trim().toLowerCase()}:${code}`).digest("hex");
}

/** 256-bit random session token for the cookie. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Keyed hash of the client IP for rate limiting without storing the IP. */
export function hashIp(ip: string | null, key = secret()): string | null {
  if (!ip) return null;
  return createHmac("sha256", key).update(`ip:${ip}`).digest("hex").slice(0, 32);
}
