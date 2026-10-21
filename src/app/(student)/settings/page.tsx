import { LogOut, Sparkles } from "lucide-react";
import { signOut } from "@/app/sign-in/actions";
import { DeleteAccount } from "@/components/profile/delete-account";
import { Button } from "@/components/ui/button";
import { Notice, PageHeader, SectionCard } from "@/components/ui/misc";
import { getAIStatus } from "@/lib/ai/config";
import { requireStudent } from "@/lib/data/session";

export const metadata = { title: "Settings" };

const HOW_IT_WORKS = [
  ["Your profile", "Shapes who you're suggested and how compatibility is explained. Specific strengths, honest development areas and complete working-style answers make suggestions more useful."],
  ["Why someone is suggested", "Profiles are ordered by a transparent compatibility estimate: complementary skills, industry interests, relevant experience, working style, goals and communication. Nobody is hidden for a low estimate."],
  ["Interested", "Private. The other student never sees a one-way interest."],
  ["Mutual match", "Happens when you're both interested. You can then see each other's MESA email to talk."],
  ["Ranking", "Your private order of preference across your shortlist. It never creates a match by itself."],
  ["Partnership", "Final only when both students in a mutual match confirm. Each student can have one confirmed partner; only the programme team can cancel a final partnership."],
  ["AI suggestions", "Optional help to word your profile and explain a fit. AI text is always labelled, you approve anything before it's saved, and it never decides matches."],
  ["Reporting", "Use “Report a concern” on any profile. Reports go privately to the programme team, who review them before acting."],
] as const;

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const viewer = await requireStudent("/settings");
  const { notice } = await searchParams;
  const ai = getAIStatus();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Settings" />

      {notice === "suspended" || viewer.status.suspended ? (
        <Notice tone="warning" title="Your profile is paused">
          The programme team has temporarily hidden your profile from discovery, so matching features are unavailable. Please contact them for details.
        </Notice>
      ) : null}

      <SectionCard title="Account">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-subtle">Signed in as</dt>
            <dd className="mt-0.5 font-medium break-all text-ink">{viewer.email}</dd>
          </div>
          <div>
            <dt className="text-ink-subtle">Profile status</dt>
            <dd className="mt-0.5 font-medium text-ink">{viewer.status.profile_status === "published" ? "Published to your cohort" : "Draft (not visible)"}</dd>
          </div>
        </dl>
        <form action={signOut} className="mt-5">
          <Button type="submit" variant="secondary" icon={<LogOut className="size-4" />}>
            Sign out
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="Privacy and visibility">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-ink-muted">
          <li>Your published profile — including strengths, development areas, industries and working-style answers — is visible to verified students in your BSL cohort and to the programme team.</li>
          <li>It is never public on the internet; every page requires a verified MESA sign-in.</li>
          <li>Your email address is shared only with students you have a mutual match with.</li>
          <li>Likes, passes and your ranking are private to you. Administrators see aggregate counts, not who you liked.</li>
          <li>Reports and moderation notes are visible only to the programme team.</li>
        </ul>
      </SectionCard>

      <SectionCard title="AI features">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-forest-600" aria-hidden />
          {ai.available
            ? "AI writing suggestions and fit explanations are available. Only the profile details needed are sent to the AI provider — never your name, email or account details."
            : "AI features are currently unavailable. Everything else, including compatibility insights, works without them."}
        </p>
      </SectionCard>

      <SectionCard title="How BSL Connect works">
        <dl className="flex flex-col gap-4">
          {HOW_IT_WORKS.map(([term, desc]) => (
            <div key={term}>
              <dt className="text-sm font-semibold text-ink">{term}</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-ink-muted">{desc}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <SectionCard title="Remove my account">
        <DeleteAccount requested={viewer.status.deletion_requested} partnered={Boolean(viewer.status.partnership_match_id)} />
      </SectionCard>
    </div>
  );
}
