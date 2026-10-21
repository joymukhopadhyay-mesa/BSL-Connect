import { StudentNav } from "@/components/shell/student-nav";
import { requireStudent } from "@/lib/data/session";

export default async function StudentLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireStudent();
  const [row] = await viewer.db.query<{ n: number }>(
    "select count(*)::int as n from public.matches where (student_low = $1 or student_high = $1) and status in ('mutual', 'pending_confirmation')",
    [viewer.id],
  );
  const count = row?.n ?? 0;

  return (
    <div className="min-h-dvh">
      <StudentNav openMatches={count ?? 0} partnered={Boolean(viewer.status.partnership_match_id)} isAdmin={viewer.status.is_admin} />
      <main className="mx-auto max-w-6xl px-4 pt-[calc(1.25rem+var(--safe-top))] pb-nav sm:px-6 md:pt-8 md:pb-16">{children}</main>
    </div>
  );
}
