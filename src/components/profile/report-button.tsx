"use client";

import { Flag } from "lucide-react";
import { useState, useTransition } from "react";
import { submitReport } from "@/app/(student)/actions";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { REPORT_CATEGORIES } from "@/lib/profile/options";

export function ReportButton({ reportedId, name, className }: { reportedId: string; name: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "submitted" | "already_reported">(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitReport({ reportedId, category, explanation });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(res.data.status);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-muted hover:bg-forest-800/5 hover:text-ink"}
      >
        <Flag className="size-4" aria-hidden /> Report a concern
      </button>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setDone(null);
          setCategory("");
          setExplanation("");
        }}
        title={`Report ${name.split(" ")[0] || "this profile"}`}
        description="Reports go privately to the BSL programme team. The student isn't told who reported them, and a report isn't treated as proof — the team reviews it first."
        size="sm"
        footer={
          done ? null : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} loading={pending} disabled={!category}>
                Send report
              </Button>
            </div>
          )
        }
      >
        {done ? (
          <Notice tone="success" title={done === "submitted" ? "Thank you — your report was sent" : "You've already reported this profile"}>
            {done === "submitted"
              ? "The programme team will review it. You don't need to do anything else."
              : "The programme team is reviewing your earlier report."}
          </Notice>
        ) : (
          <div className="flex flex-col gap-6">
            <ChoiceGroup legend="What's the concern?" options={REPORT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} type="single" value={category} onChange={(v) => setCategory(v as string)} />
            <Field label="Anything else the team should know?" optional counter={{ value: explanation.length, max: 1000 }}>
              {({ id }) => <Textarea id={id} rows={3} maxLength={1000} value={explanation} onChange={(e) => setExplanation(e.target.value)} />}
            </Field>
            {error ? <Notice tone="danger">{error}</Notice> : null}
          </div>
        )}
      </Sheet>
    </>
  );
}
