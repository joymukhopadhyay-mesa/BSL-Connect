import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removePhoto, setSuspension } from "@/app/admin/actions";
import { NoteAction } from "@/components/admin/note-action";
import { ProfileDetail } from "@/components/profile/profile-detail";
import { Tag } from "@/components/ui/chips";
import { Notice, ProfilePhoto, SectionCard } from "@/components/ui/misc";
import { getProfiles, getPublicProfile, normalizeMatch, otherParticipant } from "@/lib/data/profiles";
import { requireAdmin } from "@/lib/data/session";
import { fieldLabel } from "@/lib/profile/completion";
import type { MatchRow } from "@/lib/profile/types";

export const metadata = { title: "Student" };

type Account = {
  email: string;
  email_verified: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  role: string;
  suspended: boolean;
  suspension_reason: string | null;
  likes_given: number;
  likes_received: number | null;
  is_self: boolean;
  deletion_requested_at: string | null;
  missing_fields: string[] | null;
};

const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default async function AdminStudentDetail({ params }: PageProps<"/admin/students/[id]">) {
  const { id } = await params;
  const admin = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [profile, account, matchData, reportData, auditData] = await Promise.all([
    getPublicProfile(admin.db, id),
    admin.db.rpc("admin_student_account", { p_user: id }),
  admin.db.query("select * from public.matches where student_low = $1 or student_high = $1 order by updated_at desc", [id]),
        admin.db.query("select id, category, status, created_at from public.reports where reported_id = $1 order by created_at desc", [id]),
        admin.db.query("select id, action, details, created_at from public.audit_log where subject_id = $1 order by created_at desc limit 20", [id]),
  ]);
  if (!profile || !account) notFound();
  const a = account as Account;
  const matches: MatchRow[] = matchData.map(normalizeMatch);
  const others = await getProfiles(admin.db, matches.map((m) => otherParticipant(m, id)));
  const nameOf = new Map(others.map((p) => [p.id, p.full_name ?? "Unnamed"]));
  const reports = (reportData as unknown as Array<{ id: string; category: string; status: string; created_at: string }>);
  const audit = (auditData as unknown as Array<{ id: number; action: string; details: Record<string, unknown>; created_at: string }>);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/students" className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted hover:text-forest-800">
        <ArrowLeft className="size-4" /> All students
      </Link>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          {a.is_self ? (
            <Notice tone="info" title="This is your own profile">
              Moderation of your profile, reports involving you and your partnership reviews are handled by another
              administrator, so those controls and records are hidden here.
            </Notice>
          ) : null}
          <div className="surface rounded-[var(--radius-card)] p-5 shadow-soft sm:p-8">
            <ProfileDetail profile={profile} photoUrl={profile.photo_url} />
          </div>
          <SectionCard title="Matches and partnership">
            {matches.length === 0 ? (
              <p className="text-sm text-ink-muted">No mutual matches.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line text-sm">
                {matches.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/admin/students/${otherParticipant(m, id)}`} className="hover:underline">
                      {nameOf.get(otherParticipant(m, id)) ?? "Unavailable profile"}
                    </Link>
                    <Tag tone={m.status === "finalised" ? "forest" : ["mutual", "pending_confirmation"].includes(m.status) ? "sage" : "outline"}>
                      {m.status.replace("_", " ")}
                    </Tag>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-32">
          <SectionCard title="Account">
            <dl className="flex flex-col gap-3 text-sm">
              <div><dt className="text-ink-subtle">Email</dt><dd className="break-all text-ink">{a.email}</dd></div>
              <div><dt className="text-ink-subtle">Email verified</dt><dd className="text-ink">{a.email_verified ? "Yes" : "No"}</dd></div>
              <div><dt className="text-ink-subtle">Joined</dt><dd className="text-ink">{fmt(a.created_at)}</dd></div>
              <div><dt className="text-ink-subtle">Last sign-in</dt><dd className="text-ink">{fmt(a.last_sign_in_at)}</dd></div>
              <div><dt className="text-ink-subtle">Profile</dt><dd className="text-ink">{profile.status === "published" ? "Published" : "Draft"}</dd></div>
              <div><dt className="text-ink-subtle">Participation</dt><dd className="text-ink tabular-nums">{a.likes_given} interested{a.likes_received !== null ? ` · ${a.likes_received} received` : ""}</dd></div>
            </dl>
            {a.missing_fields?.length ? (
              <p className="mt-3 text-xs text-ink-muted">Missing: {Array.from(new Set(a.missing_fields.map(fieldLabel))).join(", ")}</p>
            ) : null}
            {a.deletion_requested_at ? <Notice tone="warning" className="mt-3">Requested account removal on {fmt(a.deletion_requested_at)}.</Notice> : null}
          </SectionCard>

          {a.is_self ? null : (
          <SectionCard title="Moderation">
            {a.suspended ? (
              <Notice tone="danger" className="mb-4" title="Suspended">
                {a.suspension_reason}
              </Notice>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {a.suspended ? (
                <NoteAction
                  label="Reinstate profile"
                  title="Reinstate this profile?"
                  description="The student returns to discovery if their profile is published."
                  confirmLabel="Reinstate"
                  action={setSuspension.bind(null, id, false)}
                  successMessage="Profile reinstated."
                />
              ) : (
                <NoteAction
                  label="Suspend profile"
                  title="Suspend this profile?"
                  description="Hides the student from discovery and pauses their matching. Existing partnerships are not changed. The student sees that their profile is paused, but not your note."
                  confirmLabel="Suspend"
                  danger
                  action={setSuspension.bind(null, id, true)}
                  successMessage="Profile suspended."
                />
              )}
            </div>
          </SectionCard>

          )}

          <SectionCard title="Profile photo">
            <ProfilePhoto src={profile.photo_url} name={profile.full_name} className="aspect-[4/5] w-full max-w-[12rem] text-3xl" rounded="rounded-2xl" />
            {profile.photo_path && !a.is_self ? (
              <div className="mt-4">
                <NoteAction
                  label="Remove photo"
                  title="Remove this photo?"
                  description="Deletes the photo and returns the profile to draft until the student uploads a new one."
                  confirmLabel="Remove photo"
                  danger
                  action={removePhoto.bind(null, id)}
                  successMessage="Photo removed."
                />
              </div>
            ) : !profile.photo_path ? (
              <p className="mt-3 text-sm text-ink-muted">No photo uploaded.</p>
            ) : null}
          </SectionCard>

          <SectionCard title="Reports about this student">
            {reports.length === 0 ? (
              <p className="text-sm text-ink-muted">None.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <Link href={`/admin/reports#${r.id}`} className="hover:underline">{r.category.replaceAll("_", " ")}</Link>
                    <Tag tone={r.status === "open" ? "amber" : "outline"}>{r.status.replace("_", " ")}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Audit history">
            {audit.length === 0 ? (
              <p className="text-sm text-ink-muted">No moderation history.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-xs text-ink-muted">
                {audit.map((e) => (
                  <li key={e.id}>
                    <span className="font-medium text-ink">{e.action.replaceAll("_", " ")}</span> · {fmt(e.created_at)}
                    {typeof e.details?.reason === "string" && e.details.reason ? <span className="block">“{e.details.reason}”</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
