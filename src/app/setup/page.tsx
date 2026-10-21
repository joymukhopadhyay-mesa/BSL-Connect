import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SectionCard, Wordmark } from "@/components/ui/misc";
import { isDatabaseConfigured } from "@/lib/env";

export const metadata = { title: "Setup required" };

/** Shown only when the deployment is missing its server configuration. No secrets are displayed. */
export default async function SetupPage() {
  await connection();
  if (isDatabaseConfigured()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <Wordmark />
      <h1 className="font-display text-4xl text-forest-900">Setup required</h1>
      <p className="leading-relaxed text-ink-muted">
        BSL Connect needs its database and sign-in settings. Add the variables below to
        <code className="mx-1 rounded bg-ivory-200 px-1.5 py-0.5 text-sm">.env.local</code>(or your hosting
        provider&apos;s environment settings) and restart the server.
      </p>
      <SectionCard title="Required">
        <ul className="space-y-2 font-mono text-sm">
          <li>DATABASE_URL — Neon Postgres connection string</li>
          <li>AUTH_SECRET — at least 32 random characters</li>
          <li>RESEND_API_KEY and EMAIL_FROM — sign-in code emails</li>
        </ul>
      </SectionCard>
      <SectionCard title="Optional">
        <ul className="space-y-2 font-mono text-sm">
          <li>OPENROUTER_API_KEY — enables AI profile coaching and fit explanations (Google models)</li>
          <li>NEXT_PUBLIC_SITE_URL — public URL of the app</li>
        </ul>
      </SectionCard>
      <p className="text-sm text-ink-muted">Full instructions are in the project README.</p>
    </main>
  );
}
