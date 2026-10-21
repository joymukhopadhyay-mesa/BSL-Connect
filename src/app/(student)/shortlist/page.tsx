import { PageHeader } from "@/components/ui/misc";
import { ShortlistManager, type ShortlistEntry } from "@/components/shortlist/shortlist-manager";
import { getMyMatches, getProfiles, otherParticipant } from "@/lib/data/profiles";
import { requireActiveStudent } from "@/lib/data/session";
import { scoreCompatibility } from "@/lib/matching/scoring";
import { getProfile } from "@/lib/data/profiles";

export const metadata = { title: "Shortlist" };

export default async function ShortlistPage() {
  const viewer = await requireActiveStudent("/shortlist");
  const db = viewer.db;

  const [likes, ranks, passes, matches, me] = await Promise.all([
    db.query<{ target_id: string }>("select target_id from public.likes where liker_id = $1 order by created_at desc", [viewer.id]),
    db.query<{ candidate_id: string; rank: number }>("select candidate_id, rank from public.shortlist_ranks where user_id = $1", [viewer.id]),
    db.query<{ target_id: string }>("select target_id from public.passes where actor_id = $1 order by created_at desc", [viewer.id]),
    getMyMatches(db, viewer.id),
    getProfile(db, viewer.id),
  ]);

  const likedIds = likes.map((l) => l.target_id);
  const passedIds = passes.map((p) => p.target_id);
  const profiles = await getProfiles(db, [...likedIds, ...passedIds]);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const rankBy = new Map(ranks.map((r) => [r.candidate_id, Number(r.rank)]));
  const matchBy = new Map(matches.map((m) => [otherParticipant(m, viewer.id), m]));

  const toEntry = (id: string): ShortlistEntry | null => {
    const p = byId.get(id);
    if (!p) return null; // no longer visible (unpublished or suspended)
    const m = matchBy.get(id);
    return {
      id,
      name: p.full_name ?? "",
      role: p.role_title,
      photoUrl: p.photo_url,
      compatibility: me ? scoreCompatibility(me, p) : null,
      rank: rankBy.get(id) ?? null,
      match: m ? { id: m.id, status: m.status } : null,
    };
  };

  const liked = likedIds
    .map(toEntry)
    .filter((e): e is ShortlistEntry => e !== null)
    .sort((a, b) => (a.rank ?? 10_000) - (b.rank ?? 10_000));
  const passed = passedIds.map(toEntry).filter((e): e is ShortlistEntry => e !== null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Your preferences"
        title="Shortlist"
        description="Everyone you're interested in, in your order of preference. Rank them to keep your thinking clear — ranking is private, and it never creates a match on its own."
      />
      <ShortlistManager initialLiked={liked} passed={passed} />
    </div>
  );
}
