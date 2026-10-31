import { Eye, PencilLine, Settings } from "lucide-react";
import { notFound } from "next/navigation";
import { FinalFormCard } from "@/components/problem-statements/final-form-card";
import { VisibilityToggle } from "@/components/profile/visibility-toggle";
import { ProfileDetail } from "@/components/profile/profile-detail";
import { ButtonLink } from "@/components/ui/button";
import { Notice, PageHeader, Progress } from "@/components/ui/misc";
import { getPublicProfile } from "@/lib/data/profiles";
import { requireStudent } from "@/lib/data/session";
import { completionPercent, fieldLabel, missingFields, stepForField } from "@/lib/profile/completion";
import { LAST_STEP } from "@/lib/profile/schema";

export const metadata = { title: "Your profile" };

export default async function MePage() {
  const viewer = await requireStudent("/me");
  const profile = await getPublicProfile(viewer.db, viewer.id);
  if (!profile) notFound();
  const published = profile.status === "published";
  const missing = missingFields(profile).filter((f) => !["details_confirmed", "visibility_acknowledged"].includes(f));
  const firstMissingStep = missing.length ? Math.min(...missing.map(stepForField)) : LAST_STEP;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={published ? "Visible to your cohort" : "Draft — not yet visible"}
        title="Your profile"
        actions={
          <>
            <ButtonLink href="/settings" variant="ghost" size="sm" icon={<Settings className="size-4" />}>
              Settings
            </ButtonLink>
            <ButtonLink href={published ? "/onboarding?step=1" : `/onboarding?step=${firstMissingStep}`} size="sm" icon={<PencilLine className="size-4" />}>
              {published ? "Edit profile" : "Continue profile"}
            </ButtonLink>
          </>
        }
      />

      <FinalFormCard className="mb-6" />

      {viewer.status.suspended ? (
        <Notice tone="warning" className="mb-6" title="Your profile is paused">
          The programme team has temporarily hidden your profile. Please contact them for details.
        </Notice>
      ) : null}

      {!published ? (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-line bg-white/70 p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink">Profile {completionPercent(profile)}% complete</span>
          </div>
          <Progress value={completionPercent(profile)} label="Profile completion" />
          {missing.length ? (
            <p className="text-sm text-ink-muted">
              Your profile is almost ready. Still needed: {Array.from(new Set(missing.map(fieldLabel))).join(", ")}.
            </p>
          ) : (
            <p className="text-sm text-ink-muted">Everything&apos;s in place — review and publish to start discovering partners.</p>
          )}
        </div>
      ) : (
        <VisibilityToggle published partnered={Boolean(viewer.status.partnership_match_id)} />
      )}

      <p className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
        <Eye className="size-4" aria-hidden /> This is how verified classmates see your profile.
      </p>
      <div className="surface rounded-[var(--radius-card)] p-5 shadow-soft sm:p-8">
        <ProfileDetail profile={profile} photoUrl={profile.photo_url} editHref={(s) => `/onboarding?step=${s}`} />
      </div>
    </div>
  );
}
