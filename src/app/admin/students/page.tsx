import { Search } from "lucide-react";
import Link from "next/link";
import { completeAccountDeletion } from "@/app/admin/actions";
import { NoteAction } from "@/components/admin/note-action";
import { Tag } from "@/components/ui/chips";
import { cn } from "@/components/ui/cn";
import { EmptyState, Notice, PageHeader, SectionCard } from "@/components/ui/misc";
import { requireAdmin } from "@/lib/data/session";
import { attempt } from "@/lib/data/attempt";

export const metadata = { title: "Students" };

type Row = {
  id: string;
  email: string;
  full_name: string | null;
  role_title: string | null;
  cohort: string | null;
  status: "draft" | "published";
  missing_count: number;
  email_verified: boolean;
  suspended: boolean;
  partnered: boolean;
  likes_given: number;
  open_matches: number;
  industries_interest: string[];
  strengths: string[];
  created_at: string;
  last_sign_in_at: string | null;
  deletion_requested: boolean;
};

const FILTERS = [
  ["all", "All"],
  ["complete", "Completed"],
  ["incomplete", "Incomplete"],
  ["unpartnered", "Not yet partnered"],
  ["partnered", "Partnered"],
  ["suspended", "Suspended"],
] as const;

export default async function AdminStudents({ searchParams }: PageProps<"/admin/students">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const filter = typeof sp.filter === "string" && FILTERS.some(([k]) => k === sp.filter) ? sp.filter : "all";

  const [students, deletionResult] = await Promise.all([
    attempt(admin.db.rpcRows("admin_list_students", { p_search: q || null, p_filter: filter }), []),
    attempt(admin.db.rpcRows("admin_list_deletion_requests"), []),
  ]);
  const error = students.failed;
  const data = students.data;
  const deletions = deletionResult.data;
  const rows = data as unknown as Row[];
  const deletionRows = (deletions as unknown as Array<{ user_id: string; full_name: string | null; email: string; reason: string | null; created_at: string | Date; partnered: boolean }>).map((d) => ({ ...d, created_at: d.created_at instanceof Date ? d.created_at.toISOString() : d.created_at }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Students" description="Search the cohort, review profiles and moderation status." />

      <form className="flex flex-col gap-3 sm:flex-row sm:items-center" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search students</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name, email or role"
            className="h-11 w-full rounded-full border border-line-strong bg-white pr-4 pl-11 text-sm outline-none focus:border-forest-600 focus:ring-4 focus:ring-forest-600/10"
          />
        </label>
        <input type="hidden" name="filter" value={filter} />
        <button type="submit" className="h-11 rounded-full bg-forest-800 px-5 text-sm font-medium text-ivory-50 hover:bg-forest-700">
          Search
        </button>
      </form>

      <nav aria-label="Filter students" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex min-w-max gap-1.5">
          {FILTERS.map(([key, label]) => (
            <li key={key}>
              <Link
                href={{ pathname: "/admin/students", query: { ...(q ? { q } : {}), filter: key } }}
                aria-current={filter === key ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium",
                  filter === key ? "border-forest-800 bg-forest-800 text-ivory-50" : "border-line-strong bg-white text-ink hover:border-forest-800/40",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {error ? <Notice tone="danger">Couldn&apos;t load students. Please refresh.</Notice> : null}

      {rows.length === 0 ? (
        <div className="surface rounded-[var(--radius-card)]">
          <EmptyState title={q ? "No students match your search" : "No students in this view"}>
            {q ? "Try a different name or email." : "Students appear here after they sign in for the first time."}
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="surface hidden overflow-hidden rounded-[var(--radius-panel)] shadow-soft lg:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{rows.length} students</caption>
              <thead className="border-b border-line bg-ivory-200/40 text-xs text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Student</th>
                  <th scope="col" className="px-4 py-3 font-medium">Profile</th>
                  <th scope="col" className="px-4 py-3 font-medium">Interests</th>
                  <th scope="col" className="px-4 py-3 font-medium">Participation</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-white/60">
                    <td className="px-4 py-3">
                      <Link href={`/admin/students/${r.id}`} className="font-medium text-ink hover:underline">
                        {r.full_name || "No name yet"}
                      </Link>
                      <p className="text-xs text-ink-muted">{r.email}</p>
                      {r.role_title ? <p className="text-xs text-ink-subtle">{r.role_title}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      {r.status === "published" ? <Tag tone="sage">Published</Tag> : <Tag tone="outline">{r.missing_count} item(s) missing</Tag>}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-ink-muted">{r.industries_interest.slice(0, 3).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted tabular-nums">
                      {r.likes_given} interested · {r.open_matches} open match{r.open_matches === 1 ? "" : "es"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.partnered ? <Tag tone="forest">Partnered</Tag> : null}
                        {r.suspended ? <Tag tone="danger">Suspended</Tag> : null}
                        {r.deletion_requested ? <Tag tone="amber">Removal requested</Tag> : null}
                        {!r.email_verified ? <Tag tone="outline">Unverified</Tag> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/students/${r.id}`} className="surface block rounded-2xl p-4 shadow-soft">
                  <p className="font-medium text-ink">{r.full_name || "No name yet"}</p>
                  <p className="truncate text-xs text-ink-muted">{r.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.status === "published" ? <Tag tone="sage">Published</Tag> : <Tag tone="outline">Incomplete</Tag>}
                    {r.partnered ? <Tag tone="forest">Partnered</Tag> : null}
                    {r.suspended ? <Tag tone="danger">Suspended</Tag> : null}
                    {r.deletion_requested ? <Tag tone="amber">Removal requested</Tag> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div id="deletion">
        <SectionCard title="Account removal requests" description="Profiles are hidden as soon as a student asks. Completing removal deletes their account and data; an audit entry is kept.">
          {deletionRows.length === 0 ? (
            <p className="text-sm text-ink-muted">No pending requests.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {deletionRows.map((d) => (
                <li key={d.user_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{d.full_name || d.email}</p>
                    <p className="text-xs text-ink-muted">
                      {d.email} · requested {new Date(d.created_at).toLocaleDateString("en-GB")}
                      {d.reason ? ` · “${d.reason}”` : ""}
                    </p>
                  </div>
                  {d.partnered ? (
                    <span className="text-xs text-amber">Cancel the partnership first</span>
                  ) : (
                    <NoteAction
                      label="Complete removal"
                      title={`Delete ${d.full_name || d.email}'s account?`}
                      description="This permanently deletes the account, profile, photo, likes, shortlist and matches. It can't be undone."
                      confirmLabel="Delete account"
                      noteRequired={false}
                      noteLabel="Note"
                      danger
                      action={completeAccountDeletion.bind(null, d.user_id)}
                      successMessage="Account deleted."
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
