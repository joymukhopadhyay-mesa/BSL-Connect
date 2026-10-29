import { ProblemStatementPrompt } from "@/components/problem-statements/selection-prompt";
import { DeadlineTicker } from "@/components/shell/deadline-ticker";
import { StudentNav } from "@/components/shell/student-nav";
import { requireStudent } from "@/lib/data/session";
import { PROBLEM_STATEMENT_PICKS, problemStatementsClosed } from "@/lib/profile/problem-statements";

export default async function StudentLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireStudent();
  const [[row], [me]] = await Promise.all([
    viewer.db.query<{ n: number }>(
      "select count(*)::int as n from public.matches where (student_low = $1 or student_high = $1) and status in ('mutual', 'pending_confirmation')",
      [viewer.id],
    ),
    viewer.db.query<{ problem_statements: string[] }>("select problem_statements from public.profiles where id = $1", [viewer.id]),
  ]);
  const count = row?.n ?? 0;
  const picks = me?.problem_statements ?? [];

  return (
    <div className="min-h-dvh">
      <StudentNav openMatches={count ?? 0} partnered={Boolean(viewer.status.partnership_match_id)} isAdmin={viewer.status.is_admin} />
      <main className="mx-auto max-w-6xl px-4 pt-[calc(1.25rem+var(--safe-top))] pb-nav sm:px-6 md:pt-8 md:pb-[calc(4rem+var(--ticker-height))]">
        {picks.length < PROBLEM_STATEMENT_PICKS ? (
          <ProblemStatementPrompt initial={picks} published={viewer.status.profile_status === "published"} />
        ) : null}
        {children}
      </main>
      {!problemStatementsClosed() ? (
        <DeadlineTicker className="fixed inset-x-0 bottom-[calc(var(--nav-height)+var(--safe-bottom))] z-30 md:bottom-0" />
      ) : null}
    </div>
  );
}
