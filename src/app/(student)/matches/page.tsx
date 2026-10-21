import { ChevronRight, Handshake } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BandBadge } from "@/components/matching/compatibility-panel";
import { ButtonLink } from "@/components/ui/button";
import { Tag } from "@/components/ui/chips";
import { EmptyState, Notice, PageHeader, ProfilePhoto } from "@/components/ui/misc";
import { getIntents, getMyMatches, getProfile, getProfiles, otherParticipant } from "@/lib/data/profiles";
import { requireActiveStudent } from "@/lib/data/session";
import { scoreCompatibility } from "@/lib/matching/scoring";
import type { MatchStatus } from "@/lib/profile/types";

export const metadata = { title: "Matches" };

const OPEN: MatchStatus[] = ["mutual", "pending_confirmation"];

export default async function MatchesPage() {
  const viewer = await requireActiveStudent("/matches");
  if (viewer.status.partnership_match_id) redirect("/partnership");
  const db = viewer.db;

  const [matches, me, ranks] = await Promise.all([
    getMyMatches(db, viewer.id),
    getProfile(db, viewer.id),
    db.query<{ candidate_id: string; rank: number }>("select candidate_id, rank from public.shortlist_ranks where user_id = $1", [viewer.id]),
  ]);
  const [others, intents] = await Promise.all([
    getProfiles(db, matches.map((m) => otherParticipant(m, viewer.id))),
    getIntents(db, matches.map((m) => m.id)),
  ]);
  const byId = new Map(others.map((p) => [p.id, p]));
  const rankBy = new Map(ranks.map((r) => [r.candidate_id, Number(r.rank)]));

  const rows = matches
    .map((m) => {
      const otherId = otherParticipant(m, viewer.id);
      const p = byId.get(otherId);
      return {
        m,
        p,
        rank: rankBy.get(otherId) ?? null,
        iConfirmed: intents.some((i) => i.match_id === m.id && i.student_id === viewer.id),
        theyConfirmed: intents.some((i) => i.match_id === m.id && i.student_id === otherId),
      };
    })
    .filter((r) => r.p);
  const open = rows.filter((r) => OPEN.includes(r.m.status)).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const closed = rows.filter((r) => !OPEN.includes(r.m.status));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Mutual interest"
        title="Matches"
        description="A match means you're both interested. A partnership becomes final only when both of you confirm — and you can hold one confirmation at a time."
      />

      {open.length > 1 ? (
        <Notice tone="info" className="mb-5" title="You have more than one mutual match">
          They&apos;re ordered by your shortlist ranking. Review each one and confirm the partnership you want most.
        </Notice>
      ) : null}

      {open.length === 0 ? (
        <div className="surface rounded-[var(--radius-card)] shadow-soft">
          <EmptyState icon={<Handshake className="size-6" />} title="No mutual matches yet" action={<ButtonLink href="/discover">Keep discovering</ButtonLink>}>
            When someone you&apos;re interested in is interested in you too, they&apos;ll appear here.
          </EmptyState>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map(({ m, p, rank, iConfirmed, theyConfirmed }) => (
            <li key={m.id}>
              <Link href={`/matches/${m.id}`} className="surface flex items-center gap-4 rounded-2xl p-4 shadow-soft transition hover:shadow-lift">
                <ProfilePhoto src={p!.photo_url} name={p!.full_name} className="size-16 shrink-0 text-xl" rounded="rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{p!.full_name}</p>
                  <p className="truncate text-sm text-ink-muted">{p!.role_title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {theyConfirmed ? <Tag tone="forest">{p!.full_name?.split(" ")[0]} has confirmed</Tag> : null}
                    {iConfirmed ? <Tag tone="sage">You confirmed</Tag> : null}
                    {!iConfirmed && !theyConfirmed ? <Tag tone="sage">Mutual match</Tag> : null}
                    {rank ? <Tag tone="outline">Your #{rank}</Tag> : null}
                    {me ? <BandBadge compatibility={scoreCompatibility(me, p!)} className="!py-1" /> : null}
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {closed.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-ink-muted">Closed</h2>
          <ul className="flex flex-col gap-2">
            {closed.map(({ m, p }) => (
              <li key={m.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white/50 p-3 text-sm">
                <ProfilePhoto src={p!.photo_url} name={p!.full_name} className="size-10 shrink-0 text-sm opacity-70" rounded="rounded-xl" />
                <span className="flex-1 truncate text-ink-muted">{p!.full_name}</span>
                <span className="text-xs text-ink-subtle">
                  {m.status === "declined" ? "Declined" : m.status === "cancelled" ? "Partnership cancelled" : "No longer available"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
