import { notFound } from "next/navigation";
import { DiscoveryDeck, PartneredDiscoverState } from "@/components/discover/deck";
import { getAIStatus } from "@/lib/ai/config";
import { getDiscoveryCandidates } from "@/lib/data/discovery";
import { getPublicProfile } from "@/lib/data/profiles";
import { requireActiveStudent } from "@/lib/data/session";

export const metadata = { title: "Discover partners" };

export default async function DiscoverPage() {
  const viewer = await requireActiveStudent("/discover");
  if (viewer.status.partnership_match_id) return <PartneredDiscoverState />;

  const me = await getPublicProfile(viewer.db, viewer.id);
  if (!me) notFound();
  const candidates = await getDiscoveryCandidates(viewer.db, me);

  return (
    <DiscoveryDeck
      initialCandidates={candidates}
      myPhotoUrl={me.photo_url}
      myName={me.full_name}
      myStatements={me.problem_statements}
      aiAvailable={getAIStatus().available}
    />
  );
}
