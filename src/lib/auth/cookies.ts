import "server-only";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "bsl_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function readSessionToken(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value && /^[A-Za-z0-9_-]{40,64}$/.test(value) ? value : null;
}

/** HttpOnly, Secure (in production), SameSite=Lax — not readable by scripts. */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
