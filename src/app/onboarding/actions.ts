"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCodeFrom, friendlyError } from "@/lib/errors";
import { normalizeProfile } from "@/lib/data/profiles";
import { requireStudent, type Viewer } from "@/lib/data/session";
import { isEditableStep, publishSchema, STEP_SCHEMAS } from "@/lib/profile/schema";
import type { Profile } from "@/lib/profile/types";

export type SaveResult =
  | { ok: true; profile: Profile }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; missing?: string[] };

/** Columns a student may write — mirrors the column-level grant in the database. */
const WRITABLE = new Set([
  "full_name", "cohort", "role_title", "background", "years_experience", "career_objective",
  "career_objective_detail", "intro", "strengths", "strengths_good_at", "strengths_problems",
  "strengths_example", "development_areas", "development_current", "development_complement",
  "development_help", "industries_experience", "industries_experience_detail", "industries_interest",
  "questionnaire", "partner_skills", "partner_industries", "partner_qualities", "partner_success",
  "photo_confirmed", "details_confirmed", "visibility_acknowledged", "onboarding_step", "status",
]);

/**
 * Update the caller's own profile. Values travel as one jsonb parameter and
 * are typed by Postgres via jsonb_populate_record; column names come only
 * from the whitelist above. Runs under the caller's RLS context, so the
 * update can only ever touch their own row.
 */
async function updateOwnProfile(viewer: Viewer, values: Record<string, unknown>): Promise<Profile> {
  const cols = Object.keys(values).filter((k) => WRITABLE.has(k));
  if (!cols.length) throw new Error("Nothing to update");
  const assignments = cols.map((c) => `${c} = r.${c}`).join(", ");
  const rows = await viewer.db.query(
    `update public.profiles p set ${assignments}
     from jsonb_populate_record(null::public.profiles, $1::jsonb) r
     where p.id = $2
     returning p.*`,
    [JSON.stringify(values), viewer.id],
  );
  if (!rows[0]) throw new Error("PROFILE_NOT_FOUND");
  return normalizeProfile(rows[0]);
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Save one onboarding step. Drafts may contain blanks; types, lengths and
 * vocabularies are enforced here, completeness is enforced by the database
 * on publication. Only columns belonging to the step are written.
 */
export async function saveProfileStep(step: number, input: unknown, advance: boolean): Promise<SaveResult> {
  const viewer = await requireStudent();
  if (!isEditableStep(step)) return { ok: false, error: "Unknown step." };
  const parsed = STEP_SCHEMAS[step].safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    const current = await viewer.db.maybeOne<{ onboarding_step: number }>(
      "select onboarding_step from public.profiles where id = $1",
      [viewer.id],
    );
    const currentStep = Number(current?.onboarding_step ?? 1);
    const nextStep = advance ? Math.min(8, Math.max(currentStep, step + 1)) : currentStep;
    const profile = await updateOwnProfile(viewer, { ...parsed.data, onboarding_step: nextStep });
    revalidatePath("/me");
    return { ok: true, profile };
  } catch (error) {
    if (errorCodeFrom(error) === "PROFILE_INCOMPLETE") {
      return {
        ok: false,
        error: "Your profile is published, so required fields can't be left empty. Fill them in or unpublish first.",
      };
    }
    return { ok: false, error: friendlyError(error) };
  }
}

/** Final confirmations + publish. The database re-validates completeness. */
export async function publishProfile(input: unknown): Promise<SaveResult> {
  const viewer = await requireStudent();
  if (viewer.status.deletion_requested) {
    return { ok: false, error: "You've requested account removal, so your profile can't be published." };
  }
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please confirm each statement.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  try {
    await updateOwnProfile(viewer, {
      details_confirmed: true,
      visibility_acknowledged: true,
      photo_confirmed: parsed.data.photo_confirmed,
    });
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
  try {
    const profile = await updateOwnProfile(viewer, { status: "published" });
    revalidatePath("/", "layout");
    return { ok: true, profile };
  } catch (error) {
    const status = await viewer.db.rpc<{ missing_fields?: string[] }>("my_status").catch(() => null);
    return { ok: false, error: friendlyError(error), missing: status?.missing_fields ?? [] };
  }
}

/** Hide the profile from discovery (back to draft). Existing matches are unaffected. */
export async function unpublishProfile(): Promise<SaveResult> {
  const viewer = await requireStudent();
  try {
    const profile = await updateOwnProfile(viewer, { status: "draft" });
    revalidatePath("/", "layout");
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}
