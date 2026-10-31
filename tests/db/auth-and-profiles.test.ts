import { beforeAll, describe, expect, it } from "vitest";
import {
  asUser, completeProfile, createAdmin, createDb, createStudent, createUser, errorCode, JPEG_BYTES_B64, rpc, type Db,
} from "./harness";

let db: Db;
beforeAll(async () => {
  db = await createDb();
});

describe("sign-up domain enforcement (auth.users trigger)", () => {
  it("accepts a verified @pg27.mesaschool.co address and creates a student role + draft profile", async () => {
    const id = await createUser(db, { email: "valid.student@pg27.mesaschool.co" });
    const role = await db.query<{ role: string }>("select role from public.user_roles where user_id = $1", [id]);
    expect(role.rows[0]?.role).toBe("student");
    const profile = await db.query<{ status: string }>("select status from public.profiles where id = $1", [id]);
    expect(profile.rows[0]?.status).toBe("draft");
  });

  it.each([
    "someone@gmail.com",
    "someone@mesaschool.co",
    "someone@pg27.mesaschool.co.evil.com",
    "someone@evilpg27.mesaschool.co",
    "someone@sub.pg27.mesaschool.co",
    "someone@pg27.mesaschool.com",
    "pg27.mesaschool.co@gmail.com",
  ])("rejects %s", async (email) => {
    expect(await errorCode(createUser(db, { email }))).toContain("EMAIL_DOMAIN_NOT_ALLOWED");
  });

  it("rejects changing a verified email to a non-MESA domain", async () => {
    const id = await createUser(db);
    expect(
      await errorCode(db.query("update auth.users set email = 'x@gmail.com' where id = $1", [id])),
    ).toContain("EMAIL_DOMAIN_NOT_ALLOWED");
  });

  it("allows allowlisted staff and makes them admin, never a student", async () => {
    const admin = await createAdmin(db);
    const role = await db.query<{ role: string }>("select role from public.user_roles where user_id = $1", [admin]);
    expect(role.rows[0]?.role).toBe("admin");
    const profile = await db.query("select 1 from public.profiles where id = $1", [admin]);
    expect(profile.rows).toHaveLength(0);
  });
});

describe("roles cannot be self-granted", () => {
  it("a student cannot insert or update user_roles", async () => {
    const s = await createStudent(db);
    expect(
      await errorCode(asUser(db, s, () => db.query("update public.user_roles set role = 'admin' where user_id = $1", [s]))),
    ).toMatch(/permission denied/);
    expect(
      await errorCode(asUser(db, s, () => db.query("insert into public.user_roles values ($1, 'admin')", [s]))),
    ).toMatch(/permission denied/);
  });

  it("provision_admin is not callable by students", async () => {
    const s = await createStudent(db);
    expect(
      await errorCode(asUser(db, s, () => db.query("select private.provision_admin('x@mesaschool.co')"))),
    ).toMatch(/permission denied/);
  });

  it("an unverified account is not treated as admin even if allowlisted", async () => {
    await db.query("select private.provision_admin('unverified.coord@mesaschool.co')");
    const id = await createUser(db, { email: "unverified.coord@mesaschool.co", confirmed: false });
    expect(await errorCode(rpc(db, id, "admin_overview"))).toContain("FORBIDDEN");
  });
});

describe("profiles", () => {
  it("an incomplete profile cannot be published", async () => {
    const id = await createUser(db);
    const err = await errorCode(
      asUser(db, id, () => db.query("update public.profiles set status = 'published' where id = $1", [id])),
    );
    expect(err).toContain("PROFILE_INCOMPLETE");
  });

  it("a complete profile can be published by its owner and gets published_at", async () => {
    const id = await createUser(db);
    await completeProfile(db, id, { publish: false });
    await asUser(db, id, () => db.query("update public.profiles set status = 'published' where id = $1", [id]));
    const res = await db.query<{ status: string; published_at: string | null }>(
      "select status, published_at from public.profiles where id = $1", [id]);
    expect(res.rows[0]?.status).toBe("published");
    expect(res.rows[0]?.published_at).not.toBeNull();
  });

  it("a published profile cannot be edited into an incomplete state", async () => {
    const id = await createStudent(db);
    const err = await errorCode(
      asUser(db, id, () => db.query("update public.profiles set intro = '' where id = $1", [id])),
    );
    expect(err).toContain("PROFILE_INCOMPLETE");
  });

  it("missing questionnaire answers block publication", async () => {
    const id = await createUser(db);
    await completeProfile(db, id, { publish: false });
    await db.query(`update public.profiles set questionnaire = '{"answers":{"working_style":"structured"}}' where id = $1`, [id]);
    const missing = await db.query<{ m: string[] }>(
      "select private.profile_missing_fields(p) as m from public.profiles p where id = $1", [id]);
    expect(missing.rows[0]?.m).toContain("questionnaire.conflict");
    expect(
      await errorCode(asUser(db, id, () => db.query("update public.profiles set status='published' where id=$1", [id]))),
    ).toContain("PROFILE_INCOMPLETE");
  });

  it("a student can edit their own profile and the version increments", async () => {
    const id = await createStudent(db);
    const before = await db.query<{ version: number }>("select version from public.profiles where id = $1", [id]);
    await asUser(db, id, () => db.query("update public.profiles set intro = 'Updated intro' where id = $1", [id]));
    const after = await db.query<{ version: number; intro: string }>("select version, intro from public.profiles where id = $1", [id]);
    expect(after.rows[0]?.intro).toBe("Updated intro");
    expect(after.rows[0]!.version).toBe(before.rows[0]!.version + 1);
  });

  it("a student cannot edit another student's profile", async () => {
    const a = await createStudent(db, "A");
    const b = await createStudent(db, "B");
    const res = await asUser(db, a, () =>
      db.query("update public.profiles set intro = 'hijacked' where id = $1", [b]));
    expect(res.affectedRows ?? 0).toBe(0);
    const row = await db.query<{ intro: string }>("select intro from public.profiles where id = $1", [b]);
    expect(row.rows[0]?.intro).not.toBe("hijacked");
  });

  it("protected columns (photo_path, version, published_at) cannot be written by the client", async () => {
    const a = await createStudent(db);
    for (const sql of [
      "update public.profiles set photo_path = null where id = $1",
      "update public.profiles set version = 999 where id = $1",
      "update public.profiles set published_at = now() where id = $1",
    ]) {
      expect(await errorCode(asUser(db, a, () => db.query(sql, [a])))).toMatch(/permission denied/);
    }
  });

  it("photo_path can only point to the owner's own fixed slot", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    expect(
      await errorCode(db.query("update public.profiles set photo_path = $1 where id = $2", [`${b}/avatar`, a])),
    ).toMatch(/check constraint/);
    expect(
      await errorCode(db.query("update public.profiles set photo_path = $1 where id = $2", [`${a}/avatar-2`, a])),
    ).toMatch(/check constraint/);
  });

  it("anonymous requests cannot read any profile", async () => {
    await createStudent(db);
    expect(await errorCode(asUser(db, null, () => db.query("select * from public.profiles")))).toMatch(/permission denied/);
  });

  it("a draft student cannot browse other profiles; a published student can", async () => {
    const published = await createStudent(db);
    const draft = await createUser(db);
    const seenByDraft = await asUser(db, draft, () => db.query("select id from public.profiles where id = $1", [published]));
    expect(seenByDraft.rows).toHaveLength(0);
    const viewer = await createStudent(db);
    const seenByViewer = await asUser(db, viewer, () => db.query("select id from public.profiles where id = $1", [published]));
    expect(seenByViewer.rows).toHaveLength(1);
  });

  it("upload_profile_photo requires explicit confirmation and a valid image type", async () => {
    const id = await createUser(db);
    expect(await errorCode(rpc(db, id, "upload_profile_photo", [JPEG_BYTES_B64, "image/jpeg", false]))).toContain("PHOTO_CONFIRMATION_REQUIRED");
    expect(await errorCode(rpc(db, id, "upload_profile_photo", [JPEG_BYTES_B64, "image/gif", true]))).toContain("PHOTO_INVALID");
    expect(await errorCode(rpc(db, id, "upload_profile_photo", ["", "image/jpeg", true]))).toContain("PHOTO_INVALID");
    const res = await rpc<{ photo_path: string }>(db, id, "upload_profile_photo", [JPEG_BYTES_B64, "image/jpeg", true]);
    expect(res.photo_path).toBe(`${id}/avatar`);
  });

  it("rejects oversized photos in the database too", async () => {
    const id = await createUser(db);
    const big = Buffer.alloc(4 * 1024 * 1024 + 1, 1).toString("base64");
    expect(await errorCode(rpc(db, id, "upload_profile_photo", [big, "image/jpeg", true]))).toContain("PHOTO_INVALID");
  });
});

describe("profile photo access", () => {
  it("there is exactly one photo slot per student; uploading again replaces it", async () => {
    const id = await createUser(db);
    await rpc(db, id, "upload_profile_photo", [JPEG_BYTES_B64, "image/jpeg", true]);
    const second = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    await rpc(db, id, "upload_profile_photo", [second, "image/png", true]);
    const rows = await db.query<{ content_type: string }>("select content_type from public.profile_photos where user_id = $1", [id]);
    expect(rows.rows).toEqual([{ content_type: "image/png" }]);
  });

  it("students cannot write photo rows directly", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    expect(await errorCode(asUser(db, a, () =>
      db.query("insert into public.profile_photos (user_id, content_type, data) values ($1, 'image/jpeg', '\xffd8ff')", [a]))))
      .toMatch(/permission denied/);
    expect(await errorCode(asUser(db, a, () => db.query("delete from public.profile_photos where user_id = $1", [b]))))
      .toMatch(/permission denied/);
    expect(await errorCode(asUser(db, a, () => db.query("update public.profile_photos set content_type = 'image/png' where user_id = $1", [b]))))
      .toMatch(/permission denied/);
  });

  it("photos are readable exactly when the profile is visible", async () => {
    const visible = await createStudent(db);
    const viewer = await createStudent(db);
    const draft = await createUser(db);
    const rows = await asUser(db, viewer, () => db.query("select user_id from public.profile_photos where user_id = $1", [visible]));
    expect(rows.rows).toHaveLength(1);
    const asDraft = await asUser(db, draft, () => db.query("select user_id from public.profile_photos where user_id = $1", [visible]));
    expect(asDraft.rows).toHaveLength(0);
    await db.query("insert into public.moderation_state (user_id, suspended) values ($1, true)", [visible]);
    const afterSuspension = await asUser(db, viewer, () => db.query("select user_id from public.profile_photos where user_id = $1", [visible]));
    expect(afterSuspension.rows).toHaveLength(0);
  });
});

describe("problem statements", () => {
  const ranked = (id: string) =>
    db.query<{ problem_statements: string[]; onboarding_step: number; status: string }>(
      "select problem_statements, onboarding_step, status from public.profiles where id = $1", [id]);
  const setPicks = (id: string, picks: string[]) =>
    asUser(db, id, () => db.query("update public.profiles set problem_statements = $2 where id = $1", [id, picks]));

  it("the database catalogue matches the app's", async () => {
    const { PROBLEM_STATEMENTS } = await import("../../src/lib/profile/problem-statements");
    const reader = await createStudent(db);
    const rows = await asUser(db, reader, () =>
      db.query<{ id: string; name: string; company: string; sector: string; focus: string; pdf_url: string }>(
        "select id, name, company, sector, focus, pdf_url from public.problem_statements order by sort_order"));
    expect(rows.rows).toEqual(PROBLEM_STATEMENTS.map((s) => ({ id: s.id, name: s.name, company: s.company, sector: s.sector, focus: s.focus, pdf_url: s.pdfUrl })));
  });

  it("three distinct catalogue picks are required to publish", async () => {
    const id = await createUser(db);
    await completeProfile(db, id, { publish: false });
    await setPicks(id, ["pocketfm", "sortment"]);
    expect(await errorCode(asUser(db, id, () => db.query("update public.profiles set status = 'published' where id = $1", [id]))))
      .toContain("PROFILE_INCOMPLETE");
    expect(await errorCode(setPicks(id, ["pocketfm", "pocketfm", "sortment"]))).toContain("INVALID_PROBLEM_STATEMENT");
    expect(await errorCode(setPicks(id, ["pocketfm", "made-up", "sortment"]))).toContain("INVALID_PROBLEM_STATEMENT");
    expect(await errorCode(setPicks(id, ["pocketfm", "sortment", "even", "apna", "gain", "emergent"]))).toMatch(/check constraint/);
    await setPicks(id, ["pocketfm", "sortment", "even", "apna", "gostops"]);
    await setPicks(id, ["even", "pocketfm", "sortment"]);
    await asUser(db, id, () => db.query("update public.profiles set status = 'published' where id = $1", [id]));
    expect((await ranked(id)).rows[0]).toMatchObject({ problem_statements: ["even", "pocketfm", "sortment"], status: "published" });
  });

  it("a profile published before picks existed stays published, and must choose before other edits", async () => {
    const id = await createStudent(db);
    await db.exec("set session_replication_role = replica");
    await db.query("update public.profiles set problem_statements = '{}' where id = $1", [id]);
    await db.exec("set session_replication_role = default");
    expect((await ranked(id)).rows[0]!.status).toBe("published");
    expect(await errorCode(asUser(db, id, () => db.query("update public.profiles set intro = 'New intro' where id = $1", [id]))))
      .toContain("PROFILE_INCOMPLETE");
    await setPicks(id, ["kuku-1", "kuku-2", "apna"]);
    await asUser(db, id, () => db.query("update public.profiles set intro = 'New intro' where id = $1", [id]));
  });

  it("a full ranking is locked after the deadline; a first choice is still allowed", async () => {
    const full = await createStudent(db);
    const late = await createUser(db);
    await completeProfile(db, late, { publish: false });
    await db.query("update public.profiles set problem_statements = '{}' where id = $1", [late]);
    await db.exec("create or replace function private.problem_statement_deadline() returns timestamptz language sql stable set search_path = '' as $$ select now() - interval '1 day' $$");
    try {
      expect(await errorCode(setPicks(full, ["apna", "pocketfm", "sortment"]))).toContain("PROBLEM_STATEMENTS_LOCKED");
      await setPicks(late, ["apna", "pocketfm", "sortment"]);
      // Adding an optional pick also counts as a change.
      expect(await errorCode(setPicks(late, ["apna", "pocketfm", "sortment", "gain"]))).toContain("PROBLEM_STATEMENTS_LOCKED");
      expect(await errorCode(setPicks(late, ["pocketfm", "apna", "sortment"]))).toContain("PROBLEM_STATEMENTS_LOCKED");
      expect(await errorCode(setPicks(late, []))).toContain("PROBLEM_STATEMENTS_LOCKED");
      // Unrelated edits still work.
      await asUser(db, full, () => db.query("update public.profiles set intro = 'Still editable' where id = $1", [full]));
    } finally {
      await db.exec("create or replace function private.problem_statement_deadline() returns timestamptz language sql stable set search_path = '' as $$ select timestamptz '2026-11-01 10:00:00+05:30' $$");
    }
  });

  it("removing a photo sends the student back to the photo step (now step 8)", async () => {
    const admin = await createAdmin(db);
    const id = await createStudent(db);
    await rpc(db, admin, "admin_remove_photo", [id, "Photo does not depict the student"]);
    expect((await ranked(id)).rows[0]).toMatchObject({ onboarding_step: 8, status: "draft" });
  });
});

describe("career objectives", () => {
  it("are required to publish, accept several entries, and enforce the limits", async () => {
    const id = await createUser(db);
    await completeProfile(db, id, { publish: false });
    await asUser(db, id, () => db.query("update public.profiles set career_objectives = '{}' where id = $1", [id]));
    expect(await errorCode(asUser(db, id, () => db.query("update public.profiles set status = 'published' where id = $1", [id]))))
      .toContain("PROFILE_INCOMPLETE");
    await asUser(db, id, () =>
      db.query("update public.profiles set career_objectives = array['consulting','product',$2] where id = $1", [id, "Founder's Office - Generalist, AI Generalist roles"]));
    await asUser(db, id, () => db.query("update public.profiles set status = 'published' where id = $1", [id]));
    const row = await db.query<{ career_objectives: string[] }>("select career_objectives from public.profiles where id = $1", [id]);
    expect(row.rows[0]!.career_objectives).toHaveLength(3);
    expect(await errorCode(db.query("update public.profiles set career_objectives = array_fill('x'::text, array[7]) where id = $1", [id])))
      .toMatch(/check constraint/);
    expect(await errorCode(db.query("update public.profiles set career_objectives = array[repeat('x', 81)] where id = $1", [id])))
      .toMatch(/check constraint/);
  });
});
