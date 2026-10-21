import "server-only";
import type { Candidate } from "@/components/discover/types";
import type { UserDb } from "@/lib/db/executor";
import { pairInsights } from "@/lib/matching/insights";
import { rankCandidates, scoreCompatibility } from "@/lib/matching/scoring";
import type { Profile } from "@/lib/profile/types";
import { normalizeProfile, photoUrl } from "./profiles";

/**
 * Discovery deck for the viewer. Eligibility (published, not suspended, not
 * partnered, not already liked/passed, not self) is decided by the
 * discovery_candidates() RPC in the database. Scoring and ordering happen
 * here with the deterministic engine; nobody is hidden for a low score.
 */
export async function getDiscoveryCandidates(db: UserDb, me: Profile): Promise<Candidate[]> {
  const rows = await db.rpcRows("discovery_candidates");
  const profiles = rows.map(normalizeProfile);
  const scored = profiles.map((p) => ({
    ...p,
    photo_url: photoUrl(p),
    compatibility: scoreCompatibility(me, p),
    insights: pairInsights(me, p),
  }));
  return rankCandidates(scored);
}
