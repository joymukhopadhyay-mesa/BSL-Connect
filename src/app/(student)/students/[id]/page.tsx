import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CompatibilityPanel } from "@/components/matching/compatibility-panel";
import { ProfileDetail } from "@/components/profile/profile-detail";
import { ReportButton } from "@/components/profile/report-button";
import { DecisionButtons } from "@/components/profile/decision-buttons";
import { SectionCard } from "@/components/ui/misc";
import { getAIStatus } from "@/lib/ai/config";
import { getMyMatches, getProfile, getPublicProfile, otherParticipant } from "@/lib/data/profiles";
import { requireActiveStudent } from "@/lib/data/session";
import { pairInsights } from "@/lib/matching/insights";
import { scoreCompatibility } from "@/lib/matching/scoring";

export const metadata = { title: "Student profile" };

export default async function StudentProfilePage({ params }: PageProps<"/students/[id]">) {
  const { id } = await params;
  const viewer = await requireActiveStudent(`/students/${id}`);
  if (id === viewer.id) redirect("/me");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // Fetched with the viewer's session — RLS returns nothing if they may not see it.
  const [profile, me, matches, like, pass] = await Promise.all([
    getPublicProfile(viewer.db, id),
    getProfile(viewer.db, viewer.id),
    getMyMatches(viewer.db, viewer.id),
    viewer.db.maybeOne("select target_id from public.likes where liker_id = $1 and target_id = $2", [viewer.id, id]),
    viewer.db.maybeOne("select target_id from public.passes where actor_id = $1 and target_id = $2", [viewer.id, id]),
  ]);
  if (!profile || !me) notFound();

  const match = matches.find((m) => otherParticipant(m, viewer.id) === id) ?? null;
  const compatibility = scoreCompatibility(me, profile);
  const insights = pairInsights(me, profile);
  const state = match ? "match" : like ? "liked" : pass ? "passed" : "undecided";

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/discover" className="mb-5 inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-sm text-ink-muted hover:text-forest-800">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="surface rounded-[var(--radius-card)] p-5 shadow-soft sm:p-8">
          <ProfileDetail profile={profile} photoUrl={profile.photo_url} />
          <div className="mt-8 border-t border-line pt-4">
            <ReportButton reportedId={profile.id} name={profile.full_name ?? ""} />
          </div>
        </div>
        <div className="flex flex-col gap-6 lg:sticky lg:top-24">
          <SectionCard title="Your next step">
            <DecisionButtons
              candidateId={profile.id}
              name={profile.full_name ?? ""}
              state={state}
              matchId={match?.id ?? null}
              matchStatus={match?.status ?? null}
              partnered={Boolean(viewer.status.partnership_match_id)}
            />
          </SectionCard>
          <SectionCard title="Compatibility insights">
            <CompatibilityPanel
              compatibility={compatibility}
              insights={insights}
              candidateId={profile.id}
              candidateName={profile.full_name ?? ""}
              aiAvailable={getAIStatus().available}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
