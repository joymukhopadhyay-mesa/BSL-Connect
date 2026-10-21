import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createAdmin, createDb, createStudent, createUser, errorCode, rpc, type Db } from "./harness";

let db: Db;
let admin: string;
beforeAll(async () => {
  db = await createDb();
  admin = await createAdmin(db);
});

const ADMIN_RPCS: Array<[string, unknown[]]> = [
  ["admin_overview", []],
  ["admin_list_students", [null, "all"]],
  ["admin_list_reports", [null]],
  ["admin_list_matches", [null]],
  ["admin_export_rows", []],
  ["admin_list_deletion_requests", []],
];

async function callAdmin(user: string, fn: string, args: unknown[]) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  return asUser(db, user, () => db.query(`select * from public.${fn}(${placeholders})`, args));
}

describe("admin authorisation", () => {
  it.each(ADMIN_RPCS)("a student calling %s is rejected by the server", async (fn, args) => {
    const student = await createStudent(db);
    expect(await errorCode(callAdmin(student, fn, args))).toContain("FORBIDDEN");
  });

  it("forged mutations by a student are rejected", async () => {
    const student = await createStudent(db);
    const victim = await createStudent(db);
    expect(await errorCode(rpc(db, student, "admin_set_suspension", [victim, true, "x"]))).toContain("FORBIDDEN");
    expect(await errorCode(rpc(db, student, "admin_remove_photo", [victim, "x"]))).toContain("FORBIDDEN");
    expect(await errorCode(asUser(db, student, () =>
      db.query("insert into public.moderation_state (user_id, suspended) values ($1, true)", [victim]))))
      .toMatch(/permission denied/);
  });

  it("an admin can call the dashboard RPCs", async () => {
    for (const [fn, args] of ADMIN_RPCS) {
      await expect(callAdmin(admin, fn, args)).resolves.toBeDefined();
    }
  });

  it("overview counts are derived from real records", async () => {
    const fresh = await createDb();
    const freshAdmin = await createAdmin(fresh);
    const empty = await asUser(fresh, freshAdmin, () => fresh.query<{ r: Record<string, number> }>("select public.admin_overview() r"));
    expect(empty.rows[0]!.r.total_students).toBe(0);
    const { createStudent: cs } = await import("./harness");
    const a = await cs(fresh);
    await cs(fresh);
    await createUser(fresh);
    const res = await asUser(fresh, freshAdmin, () => fresh.query<{ r: Record<string, number> }>("select public.admin_overview() r"));
    expect(res.rows[0]!.r).toMatchObject({ total_students: 3, completed_profiles: 2, incomplete_profiles: 1, active_in_discovery: 2 });
    expect(a).toBeTruthy();
  });
});

describe("moderation", () => {
  it("suspension hides the student from discovery and reinstatement restores them", async () => {
    const viewer = await createStudent(db);
    const target = await createStudent(db);
    await rpc(db, admin, "admin_set_suspension", [target, true, "Reported photo under review"]);
    let deck = await asUser(db, viewer, () => db.query<{ id: string }>("select id from public.discovery_candidates()"));
    expect(deck.rows.map((r) => r.id)).not.toContain(target);
    await rpc(db, admin, "admin_set_suspension", [target, false, null]);
    deck = await asUser(db, viewer, () => db.query<{ id: string }>("select id from public.discovery_candidates()"));
    expect(deck.rows.map((r) => r.id)).toContain(target);
    const audit = await db.query<{ action: string }>("select action from public.audit_log where subject_id=$1 order by id", [target]);
    expect(audit.rows.map((r) => r.action)).toEqual(["profile_suspended", "profile_reinstated"]);
  });

  it("students cannot read moderation state or audit logs", async () => {
    const s = await createStudent(db);
    const ms = await asUser(db, s, () => db.query("select * from public.moderation_state"));
    expect(ms.rows).toHaveLength(0);
    const al = await asUser(db, s, () => db.query("select * from public.audit_log"));
    expect(al.rows).toHaveLength(0);
  });

  it("removing a photo unpublishes the profile until a new photo is added", async () => {
    const s = await createStudent(db);
    await rpc(db, admin, "admin_remove_photo", [s, "Photo does not depict the student"]);
    const p = await db.query<{ status: string; photo_path: string | null }>("select status, photo_path from public.profiles where id=$1", [s]);
    expect(p.rows[0]).toEqual({ status: "draft", photo_path: null });
  });
});

describe("reports", () => {
  it("a student can report, cannot read reports, and an admin can resolve with history", async () => {
    const reporter = await createStudent(db);
    const reported = await createStudent(db);
    const res = await rpc<{ status: string; report_id: string }>(db, reporter, "submit_report",
      [reported, "photo_not_of_person", "Photo looks like a stock image"]);
    expect(res.status).toBe("submitted");
    const again = await rpc<{ status: string }>(db, reporter, "submit_report", [reported, "other", null]);
    expect(again.status).toBe("already_reported");

    const asReporter = await asUser(db, reporter, () => db.query("select * from public.reports"));
    expect(asReporter.rows).toHaveLength(0);
    const asReported = await asUser(db, reported, () => db.query("select * from public.reports"));
    expect(asReported.rows).toHaveLength(0);

    expect(await errorCode(rpc(db, admin, "admin_update_report", [res.report_id, "resolved", ""]))).toContain("REASON_REQUIRED");
    await rpc(db, admin, "admin_update_report", [res.report_id, "in_review", null]);
    await rpc(db, admin, "admin_update_report", [res.report_id, "resolved", "Student replaced the photo"]);
    const list = await callAdmin(admin, "admin_list_reports", [null]);
    const row = (list.rows as Array<{ id: string; status: string; events: Array<{ action: string }> }>).find((r) => r.id === res.report_id)!;
    expect(row.status).toBe("resolved");
    expect(row.events.map((e) => e.action)).toEqual(["submitted", "status:open->in_review", "status:in_review->resolved"]);
  });

  it("a report is not proof: it changes nothing about the reported profile", async () => {
    const reporter = await createStudent(db);
    const reported = await createStudent(db);
    await rpc(db, reporter, "submit_report", [reported, "inaccurate_profile", null]);
    const deck = await asUser(db, reporter, () => db.query<{ id: string }>("select id from public.discovery_candidates()"));
    expect(deck.rows.map((r) => r.id)).toContain(reported);
  });

  it("rejects self-reports and invalid categories", async () => {
    const s = await createStudent(db);
    const t = await createStudent(db);
    expect(await errorCode(rpc(db, s, "submit_report", [s, "other", null]))).toContain("SELF_ACTION");
    expect(await errorCode(rpc(db, s, "submit_report", [t, "made_up", null]))).toContain("INVALID_CATEGORY");
  });
});

describe("exports", () => {
  it("includes only permitted cohort and partnership columns", async () => {
    const res = await callAdmin(admin, "admin_export_rows", []);
    const columns = res.fields.map((f) => f.name);
    expect(columns).toEqual([
      "full_name", "email", "cohort", "role_title", "profile_status", "career_objectives", "strengths",
      "industries_experience", "industries_interest", "partnership_status", "partner_name", "partner_email", "finalised_at",
    ]);
    for (const forbidden of ["password", "token", "encrypted_password", "likes", "reason", "questionnaire", "suspended"]) {
      expect(columns.join(",")).not.toContain(forbidden);
    }
  });
});

describe("AI quota", () => {
  it("enforces a per-user hourly limit", async () => {
    const s = await createStudent(db);
    let allowed = 0;
    for (let i = 0; i < 35; i++) {
      if (await rpc<boolean>(db, s, "consume_ai_quota", ["profile_coach"])) allowed++;
    }
    expect(allowed).toBe(30);
  });

  it("cached insights are private to the viewer", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    await rpc(db, a, "store_ai_insight", [b, "v1:v1", "test-model", JSON.stringify({ summary: "x" })]);
    const seenByB = await asUser(db, b, () => db.query("select * from public.ai_insights"));
    expect(seenByB.rows).toHaveLength(0);
    const seenByA = await asUser(db, a, () => db.query("select * from public.ai_insights"));
    expect(seenByA.rows).toHaveLength(1);
  });
});

describe("account deletion", () => {
  it("a request hides the profile; an admin then deletes the account and all student data", async () => {
    const s = await createStudent(db);
    const other = await createStudent(db);
    await rpc(db, other, "record_decision", [s, "like"]);
    expect(await errorCode(rpc(db, admin, "admin_delete_account", [s]))).toContain("DELETION_NOT_REQUESTED");

    await rpc(db, s, "request_account_deletion", ["Leaving the programme"]);
    const p = await db.query<{ status: string }>("select status from public.profiles where id=$1", [s]);
    expect(p.rows[0]?.status).toBe("draft");
    // The student cannot republish directly.
    expect(await errorCode(asUser(db, s, () => db.query("update public.profiles set status = 'published' where id = $1", [s]))))
      .toContain("DELETION_REQUESTED");

    expect(await errorCode(rpc(db, other, "admin_delete_account", [s]))).toContain("FORBIDDEN");
    await expect(rpc(db, admin, "admin_delete_account", [s])).resolves.toMatchObject({ status: "deleted" });
    for (const [table, col] of [["auth.users", "id"], ["public.profiles", "id"], ["public.profile_photos", "user_id"], ["public.likes", "target_id"]]) {
      const left = await db.query(`select 1 from ${table} where ${col} = $1`, [s]);
      expect(left.rows).toHaveLength(0);
    }
    const audit = await db.query("select 1 from public.audit_log where subject_id=$1 and action='account_deleted'", [s]);
    expect(audit.rows).toHaveLength(1);
  });

  it("is refused while the student is in a finalised partnership", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    await rpc(db, a, "record_decision", [b, "like"]);
    const m = await rpc<{ match_id: string }>(db, b, "record_decision", [a, "like"]);
    await rpc(db, a, "confirm_partnership", [m.match_id]);
    await rpc(db, b, "confirm_partnership", [m.match_id]);
    await rpc(db, a, "request_account_deletion", [null]);
    expect(await errorCode(rpc(db, admin, "admin_delete_account", [a]))).toContain("ALREADY_PARTNERED");
  });
});

describe("admins who also participate as students", () => {
  async function createStudentAdmin(name = "Student Admin") {
    const id = await createStudent(db, name);
    const email = (await db.query<{ email: string }>("select email from auth.users where id = $1", [id])).rows[0]!.email;
    await db.query("select private.provision_admin($1)", [email]);
    return id;
  }

  it("a student-domain admin keeps a student profile and gains admin access", async () => {
    const sa = await createStudentAdmin();
    const status = await rpc<{ role: string; is_admin: boolean; profile_status: string }>(db, sa, "my_status");
    expect(status).toMatchObject({ role: "student", is_admin: true, profile_status: "published" });
    await expect(callAdmin(sa, "admin_overview", [])).resolves.toBeDefined();
    const other = await createStudent(db);
    const deck = await asUser(db, other, () => db.query<{ id: string }>("select id from public.discovery_candidates()"));
    expect(deck.rows.map((r) => r.id)).toContain(sa);
  });

  it("a student-domain address allowlisted before first sign-in becomes student + admin", async () => {
    const email = `future.admin.${Date.now()}@pg27.mesaschool.co`;
    await db.query("select private.provision_admin($1)", [email]);
    const id = await createUser(db, { email });
    const r = await db.query<{ role: string; is_admin: boolean }>("select role, is_admin from public.user_roles where user_id = $1", [id]);
    expect(r.rows[0]).toEqual({ role: "student", is_admin: true });
    expect((await db.query("select 1 from public.profiles where id = $1", [id])).rows).toHaveLength(1);
  });

  it("cannot moderate themselves", async () => {
    const sa = await createStudentAdmin();
    expect(await errorCode(rpc(db, sa, "admin_set_suspension", [sa, true, "self"]))).toContain("SELF_MODERATION");
    expect(await errorCode(rpc(db, sa, "admin_remove_photo", [sa, "self"]))).toContain("SELF_MODERATION");
    await rpc(db, sa, "request_account_deletion", [null]);
    expect(await errorCode(rpc(db, sa, "admin_delete_account", [sa]))).toContain("SELF_MODERATION");
    expect((await db.query("select 1 from auth.users where id = $1", [sa])).rows).toHaveLength(1);
  });

  it("cannot see or review reports about themselves or filed by themselves", async () => {
    const sa = await createStudentAdmin();
    const other = await createStudent(db);
    const about = await rpc<{ report_id: string }>(db, other, "submit_report", [sa, "inaccurate_profile", "about the admin"]);
    const filed = await rpc<{ report_id: string }>(db, sa, "submit_report", [other, "spam", "by the admin"]);
    const list = await callAdmin(sa, "admin_list_reports", [null]);
    const ids = (list.rows as Array<{ id: string }>).map((r) => r.id);
    expect(ids).not.toContain(about.report_id);
    expect(ids).not.toContain(filed.report_id);
    expect((await asUser(db, sa, () => db.query("select id from public.reports where id = $1", [about.report_id]))).rows).toHaveLength(0);
    expect(await errorCode(rpc(db, sa, "admin_update_report", [about.report_id, "dismissed", "not me"]))).toContain("SELF_MODERATION");
    expect(await errorCode(rpc(db, sa, "admin_update_report", [filed.report_id, "resolved", "mine"]))).toContain("SELF_MODERATION");
    // Another (staff) admin can review both.
    await expect(rpc(db, admin, "admin_update_report", [about.report_id, "dismissed", "Reviewed by staff"])).resolves.toBeDefined();
    const overview = await asUser(db, sa, () => db.query<{ r: Record<string, number> }>("select public.admin_overview() r"));
    expect(overview.rows[0]!.r.reports_involving_you).toBeGreaterThanOrEqual(1);
  });

  it("cannot cancel or dismiss review of their own partnership", async () => {
    const sa = await createStudentAdmin();
    const partner = await createStudent(db);
    await rpc(db, sa, "record_decision", [partner, "like"]);
    const m = await rpc<{ match_id: string }>(db, partner, "record_decision", [sa, "like"]);
    await rpc(db, sa, "confirm_partnership", [m.match_id]);
    await rpc(db, partner, "confirm_partnership", [m.match_id]);
    await rpc(db, partner, "request_partnership_cancellation", [m.match_id, "Need to reconsider"]);
    expect(await errorCode(rpc(db, sa, "admin_dismiss_cancellation_request", [m.match_id, "no"]))).toContain("SELF_MODERATION");
    expect(await errorCode(rpc(db, sa, "admin_cancel_partnership", [m.match_id, "yes"]))).toContain("SELF_MODERATION");
    await expect(rpc(db, admin, "admin_cancel_partnership", [m.match_id, "Handled by staff"])).resolves.toMatchObject({ status: "cancelled" });
  });

  it("does not see moderation notes or audit entries about themselves", async () => {
    const sa = await createStudentAdmin();
    await rpc(db, admin, "admin_set_suspension", [sa, true, "Private staff note"]);
    expect((await asUser(db, sa, () => db.query("select * from public.moderation_state where user_id = $1", [sa]))).rows).toHaveLength(0);
    expect((await asUser(db, sa, () => db.query("select * from public.audit_log where subject_id = $1", [sa]))).rows).toHaveLength(0);
    const acct = await rpc<{ suspension_reason: string | null; is_self: boolean }>(db, sa, "admin_student_account", [sa]);
    expect(acct).toMatchObject({ suspension_reason: null, is_self: true });
  });

  it("revoking admin keeps the student profile", async () => {
    const sa = await createStudentAdmin();
    const email = (await db.query<{ email: string }>("select email from auth.users where id = $1", [sa])).rows[0]!.email;
    await db.query("select private.revoke_admin($1)", [email]);
    const status = await rpc<{ role: string; is_admin: boolean }>(db, sa, "my_status");
    expect(status).toMatchObject({ role: "student", is_admin: false });
    expect(await errorCode(callAdmin(sa, "admin_overview", []))).toContain("FORBIDDEN");
  });
});

describe("team addresses that also participate as students", () => {
  const team = () => `team.${Date.now()}.${Math.floor(Math.random() * 1e6)}@mesaschool.co`;

  it("an allowlisted team address flagged to participate becomes admin + student with a profile", async () => {
    const email = team();
    expect(await db.query<{ r: string }>("select private.provision_admin($1, 'shared mailbox', true) as r", [email])
      .then((r) => r.rows[0]!.r)).toContain("admin + student");
    const id = await createUser(db, { email });
    const role = await db.query<{ role: string; is_admin: boolean }>("select role, is_admin from public.user_roles where user_id = $1", [id]);
    expect(role.rows[0]).toEqual({ role: "student", is_admin: true });
    expect((await db.query("select 1 from public.profiles where id = $1", [id])).rows).toHaveLength(1);
    const status = await rpc<{ role: string; is_admin: boolean }>(db, id, "my_status");
    expect(status).toMatchObject({ role: "student", is_admin: true });
    await expect(callAdmin(id, "admin_overview", [])).resolves.toBeDefined();
  });

  it("without the flag, a team address stays admin-only with no profile", async () => {
    const email = team();
    await db.query("select private.provision_admin($1)", [email]);
    const id = await createUser(db, { email });
    const role = await db.query<{ role: string }>("select role from public.user_roles where user_id = $1", [id]);
    expect(role.rows[0]?.role).toBe("admin");
    expect((await db.query("select 1 from public.profiles where id = $1", [id])).rows).toHaveLength(0);
  });

  it("promoting an existing admin-only account to participate creates the profile", async () => {
    const email = team();
    await db.query("select private.provision_admin($1)", [email]);
    const id = await createUser(db, { email });
    await db.query("select private.provision_admin($1, null, true)", [email]);
    const role = await db.query<{ role: string; is_admin: boolean }>("select role, is_admin from public.user_roles where user_id = $1", [id]);
    expect(role.rows[0]).toEqual({ role: "student", is_admin: true });
    expect((await db.query("select 1 from public.profiles where id = $1", [id])).rows).toHaveLength(1);
  });

  it("nobody outside the student domain can get a student account without the owner's allowlist", async () => {
    expect(await errorCode(createUser(db, { email: team() }))).toContain("EMAIL_DOMAIN_NOT_ALLOWED");
    // The flag is not writable through the API.
    const student = await createStudent(db);
    expect(await errorCode(asUser(db, student, () => db.query("update public.staff_allowlist set participates = true")))).toMatch(/permission denied/);
    expect(await errorCode(asUser(db, student, () => db.query("select private.provision_admin('x@mesaschool.co', null, true)")))).toMatch(/permission denied/);
  });

  it("the same self-moderation limits apply, and revoking removes access", async () => {
    const email = team();
    await db.query("select private.provision_admin($1, null, true)", [email]);
    const id = await createUser(db, { email });
    expect(await errorCode(rpc(db, id, "admin_set_suspension", [id, true, "self"]))).toContain("SELF_MODERATION");
    await db.query("select private.revoke_admin($1)", [email]);
    expect((await db.query("select 1 from public.user_roles where user_id = $1", [id])).rows).toHaveLength(0);
    expect((await db.query<{ r: { status: string } }>("select auth.request_otp($1, 'h', null) as r", [email])).rows[0]!.r.status).toBe("not_allowed");
  });
});
