import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { completeAnswers, JPEG_BYTES_B64 } from "./harness";

const dir = path.resolve(import.meta.dirname, "..", "..", "db", "migrations");
const MIGRATION = "20261029000000_problem_statements.sql";

/** The problem statement migration applied to a database that already has students. */
describe("problem statement migration on existing data", () => {
  it("keeps published profiles published and moves onboarding steps", async () => {
    const db = new PGlite();
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files.filter((f) => f < MIGRATION)) await db.exec(readFileSync(path.join(dir, f), "utf8"));

    const ids: Record<string, string> = {};
    for (const [key, step] of [["published", 8], ["atPhoto", 7], ["atReview", 8], ["early", 3]] as const) {
      const { rows } = await db.query<{ id: string }>(
        "insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [`${key.toLowerCase()}@pg27.mesaschool.co`]);
      const id = rows[0]!.id;
      ids[key] = id;
      await db.query("insert into public.profile_photos (user_id, content_type, data) values ($1, 'image/jpeg', decode($2, 'base64'))", [id, JPEG_BYTES_B64]);
      await db.query(
        `update public.profiles set full_name = 'S', role_title = 'R', background = 'B', career_objectives = array['consulting'], intro = 'I',
           strengths = array['Research'], strengths_good_at = 'G', development_areas = array['Finance'], development_current = 'D',
           industries_interest = array['Fintech and financial services'], questionnaire = $2::jsonb, partner_skills = array['Finance'],
           partner_qualities = array['Reliable'], photo_path = $1 || '/avatar', photo_confirmed = true, details_confirmed = true,
           visibility_acknowledged = true, onboarding_step = $3 where id = $1`,
        [id, JSON.stringify(completeAnswers), step],
      );
    }
    await db.query("update public.profiles set status = 'published' where id = $1", [ids.published]);

    await db.exec(readFileSync(path.join(dir, MIGRATION), "utf8"));

    const { rows } = await db.query<{ id: string; status: string; onboarding_step: number; problem_statements: string[] }>(
      "select id, status, onboarding_step, problem_statements from public.profiles");
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by[ids.published!]).toMatchObject({ status: "published", onboarding_step: 9, problem_statements: [] });
    expect(by[ids.atPhoto!]!.onboarding_step).toBe(7);
    expect(by[ids.atReview!]!.onboarding_step).toBe(7);
    expect(by[ids.early!]!.onboarding_step).toBe(3);
    await db.close();
  });
});
