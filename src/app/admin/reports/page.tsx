import Link from "next/link";
import { updateReport } from "@/app/admin/actions";
import { NoteAction } from "@/components/admin/note-action";
import { Tag } from "@/components/ui/chips";
import { cn } from "@/components/ui/cn";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { requireAdmin } from "@/lib/data/session";
import { REPORT_CATEGORIES } from "@/lib/profile/options";
import { attempt } from "@/lib/data/attempt";

export const metadata = { title: "Reports" };

type ReportRow = {
  id: string;
  category: string;
  explanation: string | null;
  status: "open" | "in_review" | "resolved" | "dismissed";
  created_at: string;
  updated_at: string;
  resolution_note: string | null;
  reported_id: string;
  reported_name: string | null;
  reported_email: string | null;
  reporter_name: string | null;
  events: Array<{ action: string; note: string | null; created_at: string }>;
};

const STATUS_FILTERS = [
  ["active", "Needs review"],
  ["resolved", "Resolved"],
  ["dismissed", "Dismissed"],
  ["all", "All"],
] as const;

const when = (s: string) => new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const categoryLabel = (c: string) => REPORT_CATEGORIES.find((x) => x.value === c)?.label ?? c;

export default async function AdminReports({ searchParams }: PageProps<"/admin/reports">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const view = typeof sp.view === "string" && STATUS_FILTERS.some(([k]) => k === sp.view) ? sp.view : "active";
  const { data, failed: error } = await attempt(
    admin.db.rpcRows("admin_list_reports", { p_status: view === "resolved" || view === "dismissed" ? view : null }),
    [],
  );
  let rows = (data as unknown as ReportRow[]).map((r) => ({
    ...r,
    created_at: new Date(r.created_at as unknown as string | Date).toISOString(),
  }));
  if (view === "active") rows = rows.filter((r) => r.status === "open" || r.status === "in_review");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="Reports are concerns, not proof. Review the profile, take proportionate action, and record the outcome. Reporters' identities are never shown to the reported student."
      />

      <nav aria-label="Filter reports" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex min-w-max gap-1.5">
          {STATUS_FILTERS.map(([key, label]) => (
            <li key={key}>
              <Link
                href={{ pathname: "/admin/reports", query: { view: key } }}
                aria-current={view === key ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium",
                  view === key ? "border-forest-800 bg-forest-800 text-ivory-50" : "border-line-strong bg-white text-ink hover:border-forest-800/40",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {error ? <Notice tone="danger">Couldn&apos;t load reports. Please refresh.</Notice> : null}

      {rows.length === 0 ? (
        <div className="surface rounded-[var(--radius-card)]">
          <EmptyState title={view === "active" ? "No reports need review" : "No reports here"}>
            {view === "active" ? "New reports from students will appear here." : "Try another filter."}
          </EmptyState>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <li key={r.id} id={r.id} className="surface scroll-mt-32 rounded-[var(--radius-panel)] p-5 shadow-soft">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone={r.status === "open" ? "amber" : r.status === "in_review" ? "sage" : "outline"}>{r.status.replace("_", " ")}</Tag>
                    <span className="text-sm font-medium text-ink">{categoryLabel(r.category)}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink-muted">
                    About{" "}
                    <Link href={`/admin/students/${r.reported_id}`} className="font-medium text-ink hover:underline">
                      {r.reported_name || r.reported_email}
                    </Link>{" "}
                    · from {r.reporter_name ?? "a student (account removed)"} · {when(r.created_at)}
                  </p>
                  {r.explanation ? <p className="mt-3 max-w-2xl text-sm whitespace-pre-line text-ink">“{r.explanation}”</p> : null}
                  {r.resolution_note ? <p className="mt-2 text-sm text-ink-muted">Outcome: {r.resolution_note}</p> : null}
                </div>
                {r.status === "open" || r.status === "in_review" ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {r.status === "open" ? (
                      <NoteAction
                        label="Start review"
                        title="Mark as in review?"
                        confirmLabel="Mark in review"
                        noteRequired={false}
                        noteLabel="Note"
                        action={updateReport.bind(null, r.id, "in_review")}
                        successMessage="Marked in review."
                      />
                    ) : null}
                    <NoteAction
                      label="Resolve"
                      title="Resolve this report?"
                      description="Describe the action taken (for example, photo removed or student contacted)."
                      confirmLabel="Resolve"
                      variant="primary"
                      action={updateReport.bind(null, r.id, "resolved")}
                      successMessage="Report resolved."
                    />
                    <NoteAction
                      label="Dismiss"
                      title="Dismiss this report?"
                      description="Explain why no action is needed."
                      confirmLabel="Dismiss"
                      variant="ghost"
                      action={updateReport.bind(null, r.id, "dismissed")}
                      successMessage="Report dismissed."
                    />
                  </div>
                ) : null}
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-medium text-ink-muted">History ({r.events.length})</summary>
                <ol className="mt-2 flex flex-col gap-1 border-l border-line pl-4 text-xs text-ink-muted">
                  {r.events.map((e, i) => (
                    <li key={i}>
                      <span className="text-ink">{e.action.replace("status:", "").replace("->", " → ").replaceAll("_", " ")}</span> · {when(e.created_at)}
                      {e.note ? <span className="block">“{e.note}”</span> : null}
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
