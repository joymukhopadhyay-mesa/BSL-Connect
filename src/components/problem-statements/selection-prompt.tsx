"use client";

import { ArrowRight, ClipboardList } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveProblemStatements } from "@/app/onboarding/actions";
import { signOut } from "@/app/sign-in/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { DeadlineCountdown } from "@/components/shell/countdown";
import { PROBLEM_STATEMENT_DEADLINE_LABEL, PROBLEM_STATEMENT_PICKS } from "@/lib/profile/problem-statements";
import { ProblemStatementPicker } from "./picker";

/**
 * Shown to students who haven't ranked their problem statements. A banner
 * sits at the top of every page; for published profiles a pop-up that can't
 * be dismissed asks for the picks before anything else. Drafts are sent to
 * the onboarding step instead.
 */
export function ProblemStatementPrompt({ initial, published }: { initial: string[]; published: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [picks, setPicks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return null;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveProblemStatements({ problem_statements: picks });
      if (!res.ok) {
        setError(res.fieldErrors?.problem_statements ?? res.error);
        return;
      }
      setDone(true);
      toast.show("Problem statements saved.", { tone: "success" });
      router.refresh();
    });
  }

  return (
    <>
      <Notice tone="warning" className="mb-6" icon={<ClipboardList className="size-4" aria-hidden />} title="Choose your problem statements to use BSL Connect">
        <p>
          Rank your top {PROBLEM_STATEMENT_PICKS} company problem statements (plus up to 2 optional) by {PROBLEM_STATEMENT_DEADLINE_LABEL}. Classmates
          can filter by them to find partners working on the same brief. <DeadlineCountdown className="font-semibold tabular-nums" />
        </p>
        {!published ? (
          <ButtonLink href="/onboarding" size="sm" className="mt-3" icon={<ArrowRight className="size-4" />}>
            Continue your profile
          </ButtonLink>
        ) : null}
      </Notice>

      {published ? (
        <Sheet
          open
          onClose={() => {}}
          dismissible={false}
          title="Choose your problem statements"
          description={
            <>
              Rank {PROBLEM_STATEMENT_PICKS} problem statements, 1 being your top choice, and add up to 2 more if you like. This is required to keep
              using BSL Connect. Selections close on {PROBLEM_STATEMENT_DEADLINE_LABEL}.{" "}
              <DeadlineCountdown className="font-semibold text-forest-800 tabular-nums" />
            </>
          }
          footer={
            <div className="flex items-center justify-between gap-3">
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
              <Button onClick={save} loading={pending} disabled={picks.length < PROBLEM_STATEMENT_PICKS}>
                Save my choices
              </Button>
            </div>
          }
        >
          <ProblemStatementPicker value={picks} onChange={setPicks} disabled={pending} error={error} />
        </Sheet>
      ) : null}
    </>
  );
}
