/** Only allow same-origin relative paths as post-login destinations (no open redirects). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/auth") || next.startsWith("/sign-in")) return null;
  if (/[\r\n]/.test(next)) return null;
  return next;
}
