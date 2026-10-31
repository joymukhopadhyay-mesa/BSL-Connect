import { ClipboardCheck, ExternalLink } from "lucide-react";
import { DeadlineCountdown } from "@/components/shell/countdown";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { FINAL_SUBMISSION_FORM_URL, PROBLEM_STATEMENT_DEADLINE_LABEL } from "@/lib/profile/problem-statements";

/** Points students to the programme's final submission form (a Google Form). */
export function FinalFormCard({ className }: { className?: string }) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-2xl border border-forest-700/25 bg-sage-100/80 p-5 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex gap-3">
        <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-forest-700" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-[1.02rem] font-semibold text-forest-900">Submit your final choice</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Your picks here help you find a partner; the programme&apos;s final form is the official submission. Fill it in by{" "}
            {PROBLEM_STATEMENT_DEADLINE_LABEL}.{" "}
            <DeadlineCountdown className="font-semibold text-forest-800 tabular-nums" />
          </p>
        </div>
      </div>
      <ButtonLink
        href={FINAL_SUBMISSION_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0"
        icon={<ExternalLink className="size-4" aria-hidden />}
      >
        Fill the final form
        <span className="sr-only"> (opens in a new tab)</span>
      </ButtonLink>
    </section>
  );
}
