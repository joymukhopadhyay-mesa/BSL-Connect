import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CompatibilityPanel } from "@/components/matching/compatibility-panel";
import { ConfirmationPanel } from "@/components/matching/confirmation-panel";
import { ProfileDetail } from "@/components/profile/profile-detail";
import { ReportButton } from "@/components/profile/report-button";
import { ProfilePhoto, SectionCard } from "@/components/ui/misc";
import { getAIStatus } from "@/lib/ai/config";
import { getIntents, getProfile, getPublicProfile, normalizeMatch, otherParticipant } from "@/lib/data/profiles";
import { requireActiveStudent } from "@/lib/data/session";
import { pairInsights } from "@/lib/matching/insights";
import { scoreCompatibility } from "@/lib/matching/scoring";
import type { MatchRow } from "@/lib/profile/types";

export const metadata = { title: "Mutual match" };

export default async function MatchPage({ params }: PageProps<"/matches/[id]">) {
  const { id } = await params;
  const viewer = await requireActiveStudent(`/matches/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const matchRow = await viewer.db.maybeOne("select * from public.matches where id = $1", [id]);
  const match: MatchRow | null = matchRow ? normalizeMatch(matchRow) : null;
  if (!match) notFound();
  if (match.status === "finalised") redirect("/partnership");

  const otherId = otherParticipant(match, viewer.id);
  const [other, me, intents, contact, myOtherIntent] = await Promise.all([
    getPublicProfile(viewer.db, otherId),
    getProfile(viewer.db, viewer.id),
    getIntents(viewer.db, [match.id]),
    viewer.db.rpc<{ email: string | null }>("match_contact", { p_match: match.id }),
    viewer.db.maybeOne<{ match_id: string }>("select match_id from public.partnership_intents where student_id = $1", [viewer.id]),
  ]);
  if (!other || !me) notFound();

  const first = other.full_name?.split(" ")[0] ?? "Your match";
  const iConfirmed = intents.some((i) => i.student_id === viewer.id);
  const theyConfirmed = intents.some((i) => i.student_id === otherId);
  const confirmedElsewhere = !iConfirmed && Boolean(myOtherIntent?.match_id) && myOtherIntent?.match_id !== match.id;
  const email = (contact as { email?: string | null } | null)?.email ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/matches" className="mb-5 inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-sm text-ink-muted hover:text-forest-800">
        <ArrowLeft className="size-4" /> All matches
      </Link>

      <section className="relative mb-6 overflow-hidden rounded-[var(--radius-card)] bg-forest-800 px-6 py-8 text-ivory-50 shadow-lift sm:px-10">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(30rem 20rem at 90% 0%, rgba(185,203,180,0.25), transparent 60%)" }} />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <ProfilePhoto src={other.photo_url} name={other.full_name} className="size-20 shrink-0 border-2 border-white/20 text-2xl" rounded="rounded-[1.4rem]" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-sage-300">
              {match.status === "mutual" || match.status === "pending_confirmation" ? "Mutual match" : "Match closed"}
            </p>
            <h1 className="font-display text-[2.4rem] leading-none">{other.full_name}</h1>
            <p className="mt-1 text-sm text-ivory-100/75">{other.role_title}</p>
          </div>
        </div>
        {email && (match.status === "mutual" || match.status === "pending_confirmation") ? (
          <a href={`mailto:${email}`} className="relative mt-6 inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm hover:bg-white/18">
            <Mail className="size-4" aria-hidden /> Talk it through with {first}: <span className="font-medium break-all">{email}</span>
          </a>
        ) : null}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          <SectionCard title="Compatibility insights" description={`How you and ${first} might complement each other.`}>
            <CompatibilityPanel
              compatibility={scoreCompatibility(me, other)}
              insights={pairInsights(me, other)}
              candidateId={other.id}
              candidateName={other.full_name ?? ""}
              aiAvailable={getAIStatus().available}
            />
          </SectionCard>
          <div className="surface rounded-[var(--radius-card)] p-5 shadow-soft sm:p-8">
            <ProfileDetail profile={other} showPhoto={false} />
            <div className="mt-8 border-t border-line pt-4">
              <ReportButton reportedId={other.id} name={other.full_name ?? ""} />
            </div>
          </div>
        </div>
        <div className="lg:sticky lg:top-24">
          <ConfirmationPanel
            matchId={match.id}
            status={match.status}
            name={other.full_name ?? ""}
            iConfirmed={iConfirmed}
            theyConfirmed={theyConfirmed}
            confirmedElsewhere={confirmedElsewhere}
          />
        </div>
      </div>
    </div>
  );
}
