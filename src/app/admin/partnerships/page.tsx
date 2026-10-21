import Link from "next/link";
import { cancelPartnership, dismissCancellation } from "@/app/admin/actions";
import { NoteAction } from "@/components/admin/note-action";
import { Tag } from "@/components/ui/chips";
import { cn } from "@/components/ui/cn";
import { EmptyState, Notice, PageHeader, SectionCard } from "@/components/ui/misc";
import { requireAdmin } from "@/lib/data/session";
import { attempt } from "@/lib/data/attempt";

export const metadata = { title: "Partnerships" };

type MatchRow = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  finalised_at: string | null;
  closed_reason: string | null;
  student_low: string;
  student_high: string;
  low_name: string | null;
  high_name: string | null;
  low_confirmed: boolean;
  high_confirmed: boolean;
  cancellation_requested_at: string | null;
  cancellation_reason: string | null;
  cancellation_requested_by_name: string | null;
};

const STATUSES = [
  ["all", "All"],
  ["mutual", "Mutual"],
  ["pending_confirmation", "Awaiting confirmation"],
  ["finalised", "Finalised"],
  ["declined", "Declined"],
  ["closed", "Closed"],
  ["cancelled", "Cancelled"],
] as const;

function isoDates(r: MatchRow) {
  const f = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));
  return { created_at: f(r.created_at)!, updated_at: f(r.updated_at)!, finalised_at: f(r.finalised_at), cancellation_requested_at: f(r.cancellation_requested_at) };
}

const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");

export default async function AdminPartnerships({ searchParams }: PageProps<"/admin/partnerships">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && STATUSES.some(([k]) => k === sp.status) ? sp.status : "all";

  const [matchResult, unpartneredResult] = await Promise.all([
    attempt(admin.db.rpcRows("admin_list_matches", { p_status: status === "all" ? null : status }), []),
    attempt(admin.db.rpcRows("admin_list_students", { p_search: null, p_filter: "unpartnered" }), []),
  ]);
  const error = matchResult.failed;
  const data = matchResult.data;
  const unpartnered = unpartneredResult.data;
  const rows = (data as unknown as MatchRow[]).map((r) => ({ ...r, ...isoDates(r) }));
  const requests = rows.filter((r) => r.status === "finalised" && r.cancellation_requested_at);
  const waiting = (unpartnered as unknown as Array<{ id: string; full_name: string | null; email: string; open_matches: number; likes_given: number }> | null) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Partnerships"
        description="Monitor the mutual-match and confirmation pipeline. Partnerships are formed only by both students confirming; administrators can cancel a finalised partnership, with an audited reason, but never create one."
      />

      {error ? <Notice tone="danger">Couldn&apos;t load partnerships. Please refresh.</Notice> : null}

      {requests.length ? (
        <SectionCard title="Review requests" description="Students asked the programme team to review these partnerships.">
          <ul className="flex flex-col divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {r.low_name} &amp; {r.high_name}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Requested by {r.cancellation_requested_by_name ?? "a partner"} on {d(r.cancellation_requested_at)}
                  </p>
                  {r.cancellation_reason ? <p className="mt-2 max-w-2xl text-sm whitespace-pre-line text-ink">“{r.cancellation_reason}”</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <NoteAction
                    label="Keep partnership"
                    title="Dismiss this request?"
                    description="The partnership stays in place. Your note is recorded in the audit log."
                    confirmLabel="Dismiss request"
                    action={dismissCancellation.bind(null, r.id)}
                    successMessage="Request dismissed."
                  />
                  <NoteAction
                    label="Cancel partnership"
                    title="Cancel this partnership?"
                    description="Both students become available again. Matches that closed only because of this partnership reopen where possible. This is recorded in the audit log."
                    confirmLabel="Cancel partnership"
                    danger
                    variant="danger"
                    action={cancelPartnership.bind(null, r.id)}
                    successMessage="Partnership cancelled."
                  />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <nav aria-label="Filter by status" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex min-w-max gap-1.5">
          {STATUSES.map(([key, label]) => (
            <li key={key}>
              <Link
                href={{ pathname: "/admin/partnerships", query: { status: key } }}
                aria-current={status === key ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium",
                  status === key ? "border-forest-800 bg-forest-800 text-ivory-50" : "border-line-strong bg-white text-ink hover:border-forest-800/40",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <div className="surface rounded-[var(--radius-card)]">
          <EmptyState title="No matches in this view">Matches appear here once two students are both interested in each other.</EmptyState>
        </div>
      ) : (
        <div className="surface overflow-x-auto rounded-[var(--radius-panel)] shadow-soft">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Matches and partnerships</caption>
            <thead className="border-b border-line bg-ivory-200/40 text-xs text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Students</th>
                <th scope="col" className="px-4 py-3 font-medium">State</th>
                <th scope="col" className="px-4 py-3 font-medium">Confirmations</th>
                <th scope="col" className="px-4 py-3 font-medium">Matched</th>
                <th scope="col" className="px-4 py-3 font-medium">Updated</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/students/${r.student_low}`} className="hover:underline">{r.low_name}</Link>
                    <span className="text-ink-subtle"> &amp; </span>
                    <Link href={`/admin/students/${r.student_high}`} className="hover:underline">{r.high_name}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <Tag tone={r.status === "finalised" ? "forest" : ["mutual", "pending_confirmation"].includes(r.status) ? "sage" : "outline"}>
                      {r.status.replace("_", " ")}
                    </Tag>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {r.status === "finalised" ? "Both" : [r.low_confirmed && r.low_name, r.high_confirmed && r.high_name].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{d(r.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{d(r.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "finalised" && !r.cancellation_requested_at ? (
                      <NoteAction
                        label="Cancel"
                        title="Cancel this partnership?"
                        description="Use only for exceptional cases. Both students become available again; this is recorded in the audit log."
                        confirmLabel="Cancel partnership"
                        danger
                        variant="ghost"
                        action={cancelPartnership.bind(null, r.id)}
                        successMessage="Partnership cancelled."
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SectionCard title="Published students without a partner" description="Useful for follow-up. Counts are aggregates; individual likes stay private.">
        {waiting.length === 0 ? (
          <p className="text-sm text-ink-muted">Everyone with a published profile is partnered.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {waiting.map((w) => (
              <li key={w.id}>
                <Link href={`/admin/students/${w.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white/70 px-3 py-2 text-sm hover:border-line-strong">
                  <span className="truncate">{w.full_name || w.email}</span>
                  <span className="shrink-0 text-xs text-ink-subtle tabular-nums">
                    {w.open_matches} open · {w.likes_given} interested
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
