"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestCancellation } from "@/app/(student)/actions";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

export function CancellationRequest({
  matchId,
  requestedAt,
  requestedByMe,
}: {
  matchId: string;
  requestedAt: string | null;
  requestedByMe: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="surface rounded-[var(--radius-card)] p-5 shadow-soft sm:p-6">
      <h2 className="text-[1.05rem] font-semibold text-ink">Need to change something?</h2>
      {requestedAt ? (
        <Notice tone="warning" className="mt-3">
          {requestedByMe ? "You've" : "Your partner has"} asked the programme team to review this partnership. The team will be in touch; until
          then, the partnership stays in place.
        </Notice>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            A finalised partnership can only be cancelled by the BSL programme team. If something isn&apos;t working, you can ask them to
            review it.
          </p>
          <Button variant="secondary" className="mt-4 w-full" onClick={() => setOpen(true)}>
            Ask the programme team to review
          </Button>
        </>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Request a partnership review"
        description="Your request and reason go to the programme team. Your partner can see that a review was requested."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await requestCancellation(matchId, reason);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setOpen(false);
                  toast.show("Request sent to the programme team.", { tone: "success" });
                  router.refresh();
                })
              }
            >
              Send request
            </Button>
          </div>
        }
      >
        <Field label="What's happening?" error={error} counter={{ value: reason.length, max: 1000 }}>
          {({ id, describedBy, invalid }) => (
            <Textarea id={id} rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
          )}
        </Field>
      </Sheet>
    </section>
  );
}
