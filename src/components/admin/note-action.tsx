"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Button → confirmation sheet with an audit note → bound server action.
 * Every moderation action records who did it and why.
 */
export function NoteAction({
  label,
  title,
  description,
  confirmLabel,
  noteLabel = "Note for the audit trail",
  noteRequired = true,
  action,
  variant = "secondary",
  size = "sm",
  successMessage,
  danger,
}: {
  label: string;
  title: string;
  description?: string;
  confirmLabel: string;
  noteLabel?: string;
  noteRequired?: boolean;
  action: (note: string) => Promise<Result>;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  successMessage: string;
  danger?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={danger ? "danger" : "primary"}
              loading={pending}
              disabled={noteRequired && note.trim().length < 3}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await action(note);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setOpen(false);
                  setNote("");
                  toast.show(successMessage, { tone: "success" });
                  router.refresh();
                })
              }
            >
              {confirmLabel}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={noteLabel} optional={!noteRequired} counter={{ value: note.length, max: 1000 }}>
            {({ id }) => <Textarea id={id} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </div>
      </Sheet>
    </>
  );
}
