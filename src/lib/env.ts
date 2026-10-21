/**
 * Environment access (server-side). All secrets are read on the server only;
 * nothing here is exposed to the browser.
 */

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL) && Boolean(process.env.AUTH_SECRET) && (process.env.AUTH_SECRET?.length ?? 0) >= 32;
}


export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && Boolean(process.env.EMAIL_FROM);
}

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "http://localhost:3000";
  const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}
