import { ArrowRight, Download } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Notice, PageHeader, SectionCard } from "@/components/ui/misc";
import { requireAdmin } from "@/lib/data/session";

export const metadata = { title: "Overview" };

type Overview = Record<
  | "total_students" | "verified_students" | "completed_profiles" | "incomplete_profiles" | "active_in_discovery" | "suspended"
  | "students_with_likes" | "mutual_matches_total" | "open_matches" | "pending_confirmations" | "finalised_partnerships"
  | "students_partnered" | "students_with_match" | "outstanding_reports" | "reports_involving_you" | "cancellation_requests" | "deletion_requests",
  number
>;

export default async function AdminOverview() {
  const admin = await requireAdmin();
  const data = await admin.db.rpc<Record<string, number>>("admin_overview").catch(() => null);
  if (!data) {
    return <Notice tone="danger" title="Couldn't load metrics">Please refresh the page. If this persists, check the database connection.</Notice>;
  }
  const o = data as Overview;

  const stats: Array<{ label: string; value: number; hint?: string; href?: string }> = [
    { label: "Registered students", value: o.total_students, href: "/admin/students" },
    { label: "Verified", value: o.verified_students },
    { label: "Completed profiles", value: o.completed_profiles, href: "/admin/students?filter=complete" },
    { label: "Incomplete profiles", value: o.incomplete_profiles, href: "/admin/students?filter=incomplete" },
    { label: "Active in discovery", value: o.active_in_discovery, hint: "Published, not suspended, not partnered" },
    { label: "Open mutual matches", value: o.open_matches, hint: `${o.mutual_matches_total} created in total` },
    { label: "Confirmed partnerships", value: o.finalised_partnerships, href: "/admin/partnerships" },
    { label: "Outstanding reports", value: o.outstanding_reports, href: "/admin/reports" },
  ];

  const funnel = [
    { label: "Registered", value: o.total_students },
    { label: "Profile published", value: o.completed_profiles },
    { label: "Expressed interest", value: o.students_with_likes },
    { label: "Has a mutual match", value: o.students_with_match },
    { label: "Partnered", value: o.students_partnered },
  ];
  const max = Math.max(1, o.total_students);

  const queues = [
    { label: "Reports awaiting review", value: o.outstanding_reports, href: "/admin/reports" },
    { label: "Partnership review requests", value: o.cancellation_requests, href: "/admin/partnerships" },
    { label: "Account removal requests", value: o.deletion_requests, href: "/admin/students?filter=all#deletion" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Business Strategy Labs"
        title="Cohort overview"
        description="Live figures from the database."
        actions={
          <ButtonLink href="/admin/export" variant="secondary" size="sm" prefetch={false} icon={<Download className="size-4" />}>
            Export CSV
          </ButtonLink>
        }
      />

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => {
          const body = (
            <>
              <p className="text-sm text-ink-muted">{s.label}</p>
              <p className="mt-2 font-display text-[2.6rem] leading-none text-forest-900 tabular-nums">{s.value}</p>
              {s.hint ? <p className="mt-2 text-xs text-ink-subtle">{s.hint}</p> : null}
            </>
          );
          return (
            <li key={s.label}>
              {s.href ? (
                <Link href={s.href} className="surface block h-full rounded-[var(--radius-panel)] p-5 shadow-soft transition hover:shadow-lift">
                  {body}
                </Link>
              ) : (
                <div className="surface h-full rounded-[var(--radius-panel)] p-5 shadow-soft">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Matching funnel" description="Students at each stage, out of all registered students.">
          {o.total_students === 0 ? (
            <p className="text-sm text-ink-muted">No students have signed up yet.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {funnel.map((f) => (
                <li key={f.label}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-ink">{f.label}</span>
                    <span className="text-ink-muted tabular-nums">
                      {f.value} <span className="text-ink-subtle">({Math.round((f.value / max) * 100)}%)</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-forest-800/8">
                    <div className="h-full rounded-full bg-forest-700" style={{ width: `${(f.value / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        <SectionCard title="Needs attention">
          <ul className="flex flex-col divide-y divide-line">
            {queues.map((q) => (
              <li key={q.label}>
                <Link href={q.href} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-forest-700">
                  <span>{q.label}</span>
                  <span className="flex items-center gap-2">
                    <span className={q.value ? "rounded-full bg-amber-soft px-2.5 py-0.5 font-semibold text-amber" : "text-ink-subtle"}>{q.value}</span>
                    <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {o.suspended ? <p className="mt-3 text-xs text-ink-muted">{o.suspended} profile(s) currently suspended.</p> : null}
          {o.reports_involving_you ? (
            <p className="mt-3 text-xs text-ink-muted">
              {o.reports_involving_you} open report(s) involve you, so they&apos;re hidden here. Another administrator needs to review them.
            </p>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
