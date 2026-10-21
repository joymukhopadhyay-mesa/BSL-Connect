"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestAccountDeletion } from "@/app/(student)/actions";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";

export function DeleteAccount({ requested, partnered }: { requested: boolean; partnered: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (requested) {
    return (
      <Notice tone="info" title="Removal requested">
        Your profile is hidden and the programme team will complete the removal. Your profile, photo, likes, shortlist and matches are deleted;
        a minimal audit record of the deletion is kept.
      </Notice>
    );
  }

  return (
    <>
      <p className="text-sm leading-relaxed text-ink-muted">
        Hides your profile straight away and asks the programme team to delete your account and data.
        {partnered ? " Because you have a confirmed partner, the team will first resolve the partnership with you both." : ""}
      </p>
      <Button variant="secondary" className="mt-4 text-danger" onClick={() => setOpen(true)}>
        Request account removal
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Remove your account?"
        description="Your profile is hidden immediately. Deletion of your data is completed by the programme team."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await requestAccountDeletion(reason);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              Request removal
            </Button>
          </div>
        }
      >
        <Field label="Reason" optional error={error}>
          {({ id }) => <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </Sheet>
    </>
  );
}
