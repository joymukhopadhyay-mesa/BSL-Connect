import { Handshake, Mail } from "lucide-react";
import { TeamComposition } from "@/components/matching/compatibility-panel";
import { CancellationRequest } from "@/components/matching/cancellation-request";
import { ProfileDetail } from "@/components/profile/profile-detail";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Notice, ProfilePhoto, SectionCard } from "@/components/ui/misc";
import { notFound } from "next/navigation";
import { getProfile, getPublicProfile, normalizeMatch, otherParticipant } from "@/lib/data/profiles";
import { requireActiveStudent } from "@/lib/data/session";
import { pairInsights } from "@/lib/matching/insights";
import type { MatchRow } from "@/lib/profile/types";

export const metadata = { title: "Your partnership" };

export default async function PartnershipPage() {
  const viewer = await requireActiveStudent("/partnership");
  const matchId = viewer.status.partnership_match_id;
  if (!matchId) {
    return (
      <div className="surface mx-auto max-w-2xl rounded-[var(--radius-card)] shadow-soft">
        <EmptyState icon={<Handshake className="size-6" />} title="No confirmed partnership yet" action={<ButtonLink href="/matches">View matches</ButtonLink>}>
          When you and a mutual match both confirm, your BSL partnership appears here.
        </EmptyState>
      </div>
    );
  }

  const row = await viewer.db.maybeOne("select * from public.matches where id = $1", [matchId]);
  if (!row) notFound();
  const match: MatchRow = normalizeMatch(row);
  const partnerId = otherParticipant(match, viewer.id);
  const [partner, me, mePublic, contact] = await Promise.all([
    getPublicProfile(viewer.db, partnerId),
    getProfile(viewer.db, viewer.id),
    getPublicProfile(viewer.db, viewer.id),
    viewer.db.rpc<{ email: string | null }>("match_contact", { p_match: matchId }),
  ]);
  const email = (contact as { email?: string | null } | null)?.email ?? null;

  if (!partner || !me) {
    return (
      <Notice tone="warning" title="Your partner's profile is currently unavailable">
        Your partnership is still recorded. Please contact the programme team if you need help.
      </Notice>
    );
  }
  const first = partner.full_name?.split(" ")[0] ?? "your partner";
  const finalisedOn = match.finalised_at
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(match.finalised_at))
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-forest-800 px-6 py-10 text-center text-ivory-50 shadow-lift sm:px-10">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(34rem 22rem at 50% -10%, rgba(185,203,180,0.3), transparent 65%)" }} />
        <div className="relative flex flex-col items-center">
          <div className="flex items-center">
            <ProfilePhoto src={mePublic?.photo_url} name={me.full_name} className="size-20 border-4 border-forest-800 text-2xl" />
            <ProfilePhoto src={partner.photo_url} name={partner.full_name} className="-ml-4 size-20 border-4 border-forest-800 text-2xl" />
          </div>
          <p className="mt-5 text-sm font-medium text-sage-300">Confirmed BSL partnership</p>
          <h1 className="mt-1 font-display text-[2.5rem] leading-tight text-balance sm:text-[3rem]">
            You &amp; {partner.full_name}
          </h1>
          {finalisedOn ? <p className="mt-1 text-sm text-ivory-100/70">Finalised on {finalisedOn}</p> : null}
          {email ? (
            <a href={`mailto:${email}`} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-forest-900 shadow-float hover:bg-ivory-50">
              <Mail className="size-4" aria-hidden /> Email {first}
            </a>
          ) : null}
        </div>
      </section>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          <SectionCard title="Getting started together" description="Use these to plan your first conversation.">
            <TeamComposition insights={pairInsights(me, partner)} first={first} />
          </SectionCard>
          <div className="surface rounded-[var(--radius-card)] p-5 shadow-soft sm:p-8">
            <ProfileDetail profile={partner} photoUrl={partner.photo_url} />
          </div>
        </div>
        <div className="lg:sticky lg:top-24">
          <CancellationRequest
            matchId={match.id}
            requestedAt={match.cancellation_requested_at}
            requestedByMe={match.cancellation_requested_by === viewer.id}
          />
        </div>
      </div>
    </div>
  );
}
