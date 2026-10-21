"use client";

import { CheckCircle2, CircleDashed, Handshake } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmPartnership, declineMatch, withdrawConfirmation } from "@/app/(student)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { MatchStatus } from "@/lib/profile/types";

/**
 * Explicit two-sided confirmation. The visual steps mirror the database
 * state machine: mutual → you/they confirm → finalised.
 */
export function ConfirmationPanel({
  matchId,
  status,
  name,
  iConfirmed,
  theyConfirmed,
  confirmedElsewhere,
}: {
  matchId: string;
  status: MatchStatus;
  name: string;
  iConfirmed: boolean;
  theyConfirmed: boolean;
  confirmedElsewhere: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const first = name.split(" ")[0] || "your match";
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);

  if (status !== "mutual" && status !== "pending_confirmation") {
    const copy: Partial<Record<MatchStatus, string>> = {
      declined: "This match was declined, so it can't become a partnership.",
      closed: `${first} or you confirmed a different partnership, so this match is closed.`,
      cancelled: "This partnership was cancelled by the programme team.",
    };
    return <Notice tone="info" title="This match is closed">{copy[status] ?? "This match is no longer open."}</Notice>;
  }

  function run(action: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, onDone: (data: unknown) => void) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.show(res.error ?? "Something went wrong.", { tone: "error" });
        return;
      }
      onDone(res.data);
      router.refresh();
    });
  }

  const steps = [
    { label: "Mutual match", done: true },
    { label: "You confirm", done: iConfirmed },
    { label: `${first} confirms`, done: theyConfirmed },
  ];

  return (
    <section className="surface rounded-[var(--radius-card)] p-5 shadow-soft sm:p-6" aria-labelledby="confirm-heading">
      <h2 id="confirm-heading" className="text-[1.05rem] font-semibold text-ink">
        Partnership confirmation
      </h2>
      <ol className="mt-4 flex flex-col gap-3">
        {steps.map((s) => (
          <li key={s.label} className={cn("flex items-center gap-3 text-sm", s.done ? "text-ink" : "text-ink-subtle")}>
            {s.done ? <CheckCircle2 className="size-5 text-forest-600" aria-hidden /> : <CircleDashed className="size-5" aria-hidden />}
            {s.label}
            <span className="sr-only">{s.done ? "(done)" : "(pending)"}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-col gap-3">
        {iConfirmed ? (
          <>
            <Notice tone="success">You&apos;ve confirmed. Waiting for {first} to confirm — then your partnership is final.</Notice>
            <Button variant="secondary" loading={pending} onClick={() => run(() => withdrawConfirmation(matchId), () => toast.show("Confirmation withdrawn.", { tone: "success" }))}>
              Withdraw my confirmation
            </Button>
          </>
        ) : (
          <>
            {theyConfirmed ? (
              <Notice tone="success" title={`${first} has confirmed`}>
                Confirm now to finalise your BSL partnership.
              </Notice>
            ) : (
              <p className="text-sm leading-relaxed text-ink-muted">
                Talk with {first} first. When you&apos;re both ready, each of you confirms. The partnership becomes final when both confirmations
                are in.
              </p>
            )}
            {confirmedElsewhere ? (
              <Notice tone="warning">You&apos;ve already confirmed another match. Confirming here will withdraw that confirmation.</Notice>
            ) : null}
            <Button size="lg" onClick={() => setConfirmOpen(true)} icon={<Handshake className="size-5" />}>
              {theyConfirmed ? "Confirm and finalise" : "Confirm partnership"}
            </Button>
          </>
        )}
        <button type="button" onClick={() => setDeclineOpen(true)} className="rounded-full py-2 text-sm text-ink-muted hover:text-danger">
          Decline this match
        </button>
      </div>

      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={theyConfirmed ? `Finalise your partnership with ${first}?` : `Confirm a partnership with ${first}?`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Not yet
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () => confirmPartnership(matchId),
                  (data) => {
                    setConfirmOpen(false);
                    const d = data as { status?: string };
                    if (d?.status === "finalised") router.push("/partnership");
                    else toast.show(`Confirmed. We'll let you know when ${first} confirms.`, { tone: "success" });
                  },
                )
              }
            >
              {theyConfirmed ? "Finalise partnership" : "Confirm"}
            </Button>
          </div>
        }
      >
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-ink-muted">
          <li>{theyConfirmed ? "This finalises your BSL partnership." : `Your partnership becomes final once ${first} also confirms.`}</li>
          <li>Once final, other open matches for both of you close, and discovery pauses.</li>
          <li>A final partnership can only be changed by the programme team, if needed.</li>
        </ul>
      </Sheet>

      <Sheet
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title={`Decline the match with ${first}?`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                run(
                  () => declineMatch(matchId),
                  () => {
                    setDeclineOpen(false);
                    toast.show("Match declined.", { tone: "success" });
                    router.push("/matches");
                  },
                )
              }
            >
              Decline match
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-ink-muted">
          The match closes for both of you and {first} is removed from your shortlist. This can&apos;t be undone.
        </p>
      </Sheet>
    </section>
  );
}
