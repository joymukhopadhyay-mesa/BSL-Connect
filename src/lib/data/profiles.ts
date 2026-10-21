import "server-only";
import type { UserDb } from "@/lib/db/executor";
import type { MatchRow, Profile, PublicProfile } from "@/lib/profile/types";

/** Postgres drivers return numeric as strings and timestamps as Dates; the app uses numbers and ISO strings. */
function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export function normalizeProfile(row: Record<string, unknown>): Profile {
  const p = row as unknown as Profile;
  return {
    ...p,
    years_experience: row.years_experience === null || row.years_experience === undefined ? null : Number(row.years_experience),
    photo_updated_at: iso(row.photo_updated_at),
    published_at: iso(row.published_at),
    created_at: iso(row.created_at) ?? "",
    updated_at: iso(row.updated_at) ?? "",
    questionnaire: (row.questionnaire as Profile["questionnaire"]) ?? {},
  };
}

export function normalizeMatch(row: Record<string, unknown>): MatchRow {
  return {
    ...(row as unknown as MatchRow),
    finalised_at: iso(row.finalised_at),
    ended_at: iso(row.ended_at),
    cancellation_requested_at: iso(row.cancellation_requested_at),
    created_at: iso(row.created_at) ?? "",
    updated_at: iso(row.updated_at) ?? "",
  };
}

/**
 * Photos are served by /api/photos/[id], which re-checks the viewer's access
 * under RLS. The version parameter changes when a photo is replaced.
 */
export function photoUrl(p: Pick<Profile, "id" | "photo_path" | "photo_updated_at">): string | null {
  if (!p.photo_path) return null;
  const v = p.photo_updated_at ? `?v=${encodeURIComponent(p.photo_updated_at)}` : "";
  return `/api/photos/${p.id}${v}`;
}

export function withPhotos(profiles: Profile[]): PublicProfile[] {
  return profiles.map((p) => ({ ...p, photo_url: photoUrl(p) }));
}

export async function getProfile(db: UserDb, id: string): Promise<Profile | null> {
  const row = await db.maybeOne("select * from public.profiles where id = $1", [id]);
  return row ? normalizeProfile(row) : null;
}

export async function getPublicProfile(db: UserDb, id: string): Promise<PublicProfile | null> {
  const p = await getProfile(db, id);
  return p ? withPhotos([p])[0]! : null;
}

export async function getProfiles(db: UserDb, ids: string[]): Promise<PublicProfile[]> {
  if (!ids.length) return [];
  const rows = await db.query("select * from public.profiles where id = any($1::uuid[])", [ids]);
  return withPhotos(rows.map(normalizeProfile));
}

export async function getMyMatches(db: UserDb, me: string): Promise<MatchRow[]> {
  const rows = await db.query(
    "select * from public.matches where student_low = $1 or student_high = $1 order by updated_at desc",
    [me],
  );
  return rows.map(normalizeMatch);
}

export function otherParticipant(match: Pick<MatchRow, "student_low" | "student_high">, me: string): string {
  return match.student_low === me ? match.student_high : match.student_low;
}

export async function getIntents(db: UserDb, matchIds: string[]) {
  if (!matchIds.length) return [] as Array<{ student_id: string; match_id: string }>;
  return db.query<{ student_id: string; match_id: string }>(
    "select student_id, match_id from public.partnership_intents where match_id = any($1::uuid[])",
    [matchIds],
  );
}
