"use client";

import { Handshake, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { decide, reconsiderPass, withdrawLike } from "@/app/(student)/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { MatchStatus } from "@/lib/profile/types";

export function DecisionButtons({
  candidateId,
  name,
  state,
  matchId,
  matchStatus,
  partnered,
}: {
  candidateId: string;
  name: string;
  state: "undecided" | "liked" | "passed" | "match";
  matchId: string | null;
  matchStatus: MatchStatus | null;
  partnered: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const first = name.split(" ")[0] || "this student";

  function run(fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.show(res.error ?? "Something went wrong.", { tone: "error" });
        return;
      }
      const data = res.data as { matched?: boolean; match_id?: string } | undefined;
      if (data?.matched && data.match_id) {
        router.push(`/matches/${data.match_id}`);
        return;
      }
      toast.show(success, { tone: "success" });
      router.refresh();
    });
  }

  if (state === "match" && matchId) {
    if (matchStatus === "finalised") return <ButtonLink href="/partnership">View your partnership</ButtonLink>;
    if (matchStatus === "mutual" || matchStatus === "pending_confirmation") {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">You and {first} are a mutual match.</p>
          <ButtonLink href={`/matches/${matchId}`}>Review and confirm</ButtonLink>
        </div>
      );
    }
    return <p className="text-sm text-ink-muted">This match is closed.</p>;
  }

  if (partnered) return <p className="text-sm text-ink-muted">You already have a confirmed BSL partner.</p>;

  if (state === "liked") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-ink-muted">
          {first} is on your shortlist. If they&apos;re interested too, you&apos;ll become a mutual match.
        </p>
        <Button variant="secondary" loading={pending} onClick={() => run(() => withdrawLike(candidateId), `Removed ${first} from your shortlist`)}>
          Remove from shortlist
        </Button>
      </div>
    );
  }

  if (state === "passed") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">You passed on {first}.</p>
        <Button variant="secondary" loading={pending} icon={<RotateCcw className="size-4" />} onClick={() => run(() => reconsiderPass(candidateId), `${first} is back in your discovery list`)}>
          Reconsider
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" loading={pending} icon={<X className="size-4" />} onClick={() => run(() => decide(candidateId, "pass"), `Passed on ${first}`)}>
          Pass
        </Button>
        <Button loading={pending} icon={<Handshake className="size-4" />} onClick={() => run(() => decide(candidateId, "like"), `${first} added to your shortlist`)}>
          Interested
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-ink-subtle">Your interest stays private unless it&apos;s mutual.</p>
    </div>
  );
}
