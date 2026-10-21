import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, createStudent, createUser, errorCode, rpc, type Db } from "./harness";

let db: Db;
beforeAll(async () => {
  db = await createDb();
});

type Decision = { status: string; matched?: boolean; match_id?: string | null };
type Result = { status: string; match_id?: string };

const like = (by: string, target: string) => rpc<Decision>(db, by, "record_decision", [target, "like"]);
const pass = (by: string, target: string) => rpc<Decision>(db, by, "record_decision", [target, "pass"]);
const confirm = (by: string, match: string) => rpc<Result>(db, by, "confirm_partnership", [match]);

async function deckIds(viewer: string): Promise<string[]> {
  const res = await asUser(db, viewer, () =>
    db.query<{ id: string }>("select id from public.discovery_candidates()"));
  return res.rows.map((r) => r.id);
}

async function matchCount(a: string, b: string) {
  const res = await db.query<{ n: number }>(
    "select count(*)::int as n from public.matches where student_low = least($1::uuid,$2::uuid) and student_high = greatest($1::uuid,$2::uuid)",
    [a, b]);
  return res.rows[0]!.n;
}

async function mutual(a: string, b: string): Promise<string> {
  await like(a, b);
  const res = await like(b, a);
  return res.match_id!;
}

describe("discovery", () => {
  it("never includes the viewer, drafts, or suspended students", async () => {
    const viewer = await createStudent(db, "Viewer");
    const other = await createStudent(db, "Other");
    const draft = await createUser(db);
    const suspended = await createStudent(db, "Suspended");
    await db.query("insert into public.moderation_state (user_id, suspended) values ($1, true)", [suspended]);
    const ids = await deckIds(viewer);
    expect(ids).toContain(other);
    expect(ids).not.toContain(viewer);
    expect(ids).not.toContain(draft);
    expect(ids).not.toContain(suspended);
  });

  it("an incomplete profile cannot enter discovery", async () => {
    const draft = await createUser(db);
    expect(await errorCode(asUser(db, draft, () => db.query("select * from public.discovery_candidates()"))))
      .toContain("PROFILE_NOT_ACTIVE");
  });

  it("liked and passed profiles leave the deck; reconsidering a pass brings it back", async () => {
    const v = await createStudent(db);
    const liked = await createStudent(db);
    const passed = await createStudent(db);
    await like(v, liked);
    await pass(v, passed);
    let ids = await deckIds(v);
    expect(ids).not.toContain(liked);
    expect(ids).not.toContain(passed);
    await rpc(db, v, "reconsider_pass", [passed]);
    ids = await deckIds(v);
    expect(ids).toContain(passed);
  });

  it("suspended students are excluded and cannot act", async () => {
    const v = await createStudent(db);
    const s = await createStudent(db);
    await db.query("insert into public.moderation_state (user_id, suspended) values ($1, true)", [s]);
    expect(await errorCode(like(v, s))).toContain("TARGET_UNAVAILABLE");
    expect(await errorCode(like(s, v))).toContain("PROFILE_NOT_ACTIVE");
    const seen = await asUser(db, v, () => db.query("select id from public.profiles where id = $1", [s]));
    expect(seen.rows).toHaveLength(0);
  });
});

describe("likes and mutual matches", () => {
  it("rejects self-likes on the server", async () => {
    const a = await createStudent(db);
    expect(await errorCode(like(a, a))).toContain("SELF_ACTION");
  });

  it("handles duplicate likes safely without a second row", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    expect((await like(a, b)).status).toBe("liked");
    expect((await like(a, b)).status).toBe("duplicate");
    const n = await db.query<{ n: number }>("select count(*)::int n from public.likes where liker_id=$1 and target_id=$2", [a, b]);
    expect(n.rows[0]!.n).toBe(1);
  });

  it("a one-way like does not create a match and is invisible to the target", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const res = await like(a, b);
    expect(res.matched).toBe(false);
    expect(await matchCount(a, b)).toBe(0);
    const visibleToB = await asUser(db, b, () => db.query("select * from public.likes where liker_id = $1", [a]));
    expect(visibleToB.rows).toHaveLength(0);
  });

  it("a reciprocal like creates exactly one mutual match", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    await like(a, b);
    const res = await like(b, a);
    expect(res.matched).toBe(true);
    expect(await matchCount(a, b)).toBe(1);
    await like(a, b);
    await like(b, a);
    expect(await matchCount(a, b)).toBe(1);
    const status = await db.query<{ status: string }>("select status from public.matches where id = $1", [res.match_id]);
    expect(status.rows[0]?.status).toBe("mutual");
  });

  it("students cannot insert likes or matches directly", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    expect(await errorCode(asUser(db, a, () => db.query("insert into public.likes values ($1,$2)", [a, b]))))
      .toMatch(/permission denied/);
    expect(await errorCode(asUser(db, a, () =>
      db.query("insert into public.matches (student_low, student_high) values (least($1::uuid,$2::uuid), greatest($1::uuid,$2::uuid))", [a, b]))))
      .toMatch(/permission denied/);
  });

  it("a pass after a like is refused; a like after a pass replaces it", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const c = await createStudent(db);
    await like(a, b);
    expect(await errorCode(pass(a, b))).toContain("ALREADY_LIKED");
    await pass(a, c);
    await like(a, c);
    const p = await db.query("select 1 from public.passes where actor_id=$1 and target_id=$2", [a, c]);
    expect(p.rows).toHaveLength(0);
  });

  it("withdrawing a like is refused once a mutual match exists", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    await mutual(a, b);
    expect(await errorCode(rpc(db, a, "withdraw_like", [b]))).toContain("MATCH_EXISTS");
  });
});

describe("ranked shortlist", () => {
  it("ranking liked profiles does not create a match", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const c = await createStudent(db);
    await like(a, b);
    await like(a, c);
    await rpc(db, a, "set_shortlist_order", [[c, b]]);
    const ranks = await asUser(db, a, () =>
      db.query<{ candidate_id: string; rank: number }>("select candidate_id, rank from public.shortlist_ranks order by rank"));
    expect(ranks.rows.map((r) => r.candidate_id)).toEqual([c, b]);
    expect(await matchCount(a, b)).toBe(0);
    expect(await matchCount(a, c)).toBe(0);
  });

  it("rejects duplicates and candidates that were not liked", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const stranger = await createStudent(db);
    await like(a, b);
    expect(await errorCode(rpc(db, a, "set_shortlist_order", [[b, b]]))).toContain("DUPLICATE_CANDIDATE");
    expect(await errorCode(rpc(db, a, "set_shortlist_order", [[stranger]]))).toContain("NOT_IN_SHORTLIST");
  });

  it("shortlists are private", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    await like(a, b);
    await rpc(db, a, "set_shortlist_order", [[b]]);
    const seen = await asUser(db, b, () => db.query("select * from public.shortlist_ranks where user_id = $1", [a]));
    expect(seen.rows).toHaveLength(0);
  });
});

describe("partnership confirmation state machine", () => {
  it("progresses mutual → pending_confirmation → finalised", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const m = await mutual(a, b);
    expect((await confirm(a, m)).status).toBe("awaiting_partner");
    let s = await db.query<{ status: string }>("select status from public.matches where id=$1", [m]);
    expect(s.rows[0]?.status).toBe("pending_confirmation");
    expect((await confirm(b, m)).status).toBe("finalised");
    s = await db.query<{ status: string }>("select status from public.matches where id=$1", [m]);
    expect(s.rows[0]?.status).toBe("finalised");
    const members = await db.query("select student_id from public.partnership_members where match_id=$1", [m]);
    expect(members.rows).toHaveLength(2);
  });

  it("a non-participant cannot confirm someone else's match", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const x = await createStudent(db);
    const m = await mutual(a, b);
    expect(await errorCode(confirm(x, m))).toContain("MATCH_NOT_FOUND");
  });

  it("a student cannot finalise more than one partner", async () => {
    const a = await createStudent(db, "A");
    const b = await createStudent(db, "B");
    const c = await createStudent(db, "C");
    const ab = await mutual(a, b);
    const ac = await mutual(a, c);
    await confirm(b, ab);
    await confirm(c, ac);
    // A confirms B → finalised; A–C is closed automatically.
    expect((await confirm(a, ab)).status).toBe("finalised");
    const acStatus = await db.query<{ status: string; closed_reason: string }>(
      "select status, closed_reason from public.matches where id=$1", [ac]);
    expect(acStatus.rows[0]).toEqual({ status: "closed", closed_reason: "partner_finalised_elsewhere" });
    // Any further confirmation attempt involving A fails.
    expect(await errorCode(confirm(a, ac))).toContain("MATCH_NOT_OPEN");
    expect(await errorCode(confirm(c, ac))).toContain("MATCH_NOT_OPEN");
    const members = await db.query<{ n: number }>("select count(*)::int n from public.partnership_members where student_id=$1", [a]);
    expect(members.rows[0]!.n).toBe(1);
  });

  it("only one outstanding confirmation per student: confirming elsewhere switches it", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const c = await createStudent(db);
    const ab = await mutual(a, b);
    const ac = await mutual(a, c);
    await confirm(a, ab);
    await confirm(a, ac);
    const intents = await db.query<{ match_id: string }>("select match_id from public.partnership_intents where student_id=$1", [a]);
    expect(intents.rows.map((r) => r.match_id)).toEqual([ac]);
    const abStatus = await db.query<{ status: string }>("select status from public.matches where id=$1", [ab]);
    expect(abStatus.rows[0]?.status).toBe("mutual");
    // B confirming A–B now only records B's side; it does not finalise.
    expect((await confirm(b, ab)).status).toBe("awaiting_partner");
  });

  it("the database refuses contradictory partnership state even if an RPC were bypassed", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const c = await createStudent(db);
    const ab = await mutual(a, b);
    const ac = await mutual(a, c);
    await confirm(a, ab);
    await confirm(b, ab);
    // Simulates the losing side of a race that slipped past application checks.
    expect(await errorCode(
      db.query("insert into public.partnership_members (student_id, match_id) values ($1, $2)", [a, ac]),
    )).toMatch(/duplicate key/);
  });

  it("interleaved confirmations across overlapping pairs never yield two partners", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const c = await createStudent(db);
    const ab = await mutual(a, b);
    const ac = await mutual(a, c);
    // Every interleaving of these four calls must end with A in at most one partnership.
    const calls = [() => confirm(b, ab), () => confirm(c, ac), () => confirm(a, ab), () => confirm(a, ac)];
    for (const call of calls) {
      await call().catch(() => undefined);
    }
    const members = await db.query<{ match_id: string }>("select match_id from public.partnership_members where student_id=$1", [a]);
    expect(members.rows.length).toBeLessThanOrEqual(1);
    const finalised = await db.query<{ n: number }>(
      "select count(*)::int n from public.matches where id in ($1,$2) and status='finalised'", [ab, ac]);
    expect(finalised.rows[0]!.n).toBeLessThanOrEqual(1);
    await Promise.allSettled([confirm(b, ab), confirm(c, ac)]);
    const after = await db.query<{ n: number }>("select count(*)::int n from public.partnership_members where student_id=$1", [a]);
    expect(after.rows[0]!.n).toBeLessThanOrEqual(1);
  });

  it("partnered students leave discovery and cannot like anyone", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const c = await createStudent(db);
    const ab = await mutual(a, b);
    await confirm(a, ab);
    await confirm(b, ab);
    expect(await deckIds(c)).not.toContain(a);
    expect(await deckIds(a)).toHaveLength(0);
    expect(await errorCode(like(a, c))).toContain("ALREADY_PARTNERED");
    expect(await errorCode(like(c, a))).toContain("TARGET_UNAVAILABLE");
  });

  it("declining an open match ends it and removes the decliner's like", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const m = await mutual(a, b);
    await rpc(db, b, "decline_match", [m]);
    const s = await db.query<{ status: string }>("select status from public.matches where id=$1", [m]);
    expect(s.rows[0]?.status).toBe("declined");
    expect(await errorCode(confirm(a, m))).toContain("MATCH_NOT_OPEN");
    const l = await db.query("select 1 from public.likes where liker_id=$1 and target_id=$2", [b, a]);
    expect(l.rows).toHaveLength(0);
  });
});

describe("contact details", () => {
  it("are shared only between participants of an open or finalised mutual match", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    const x = await createStudent(db);
    await like(a, b);
    const m = (await like(b, a)).match_id!;
    const res = await rpc<{ email: string | null }>(db, a, "match_contact", [m]);
    expect(res.email).toMatch(/@pg27\.mesaschool\.co$/);
    expect(await errorCode(rpc(db, x, "match_contact", [m]))).toContain("MATCH_NOT_FOUND");
    await rpc(db, b, "decline_match", [m]);
    const after = await rpc<{ email: string | null }>(db, a, "match_contact", [m]);
    expect(after.email).toBeNull();
  });

  it("emails are not exposed through profiles", async () => {
    const a = await createStudent(db);
    const cols = await asUser(db, a, () => db.query("select * from public.profiles where id = $1", [a]));
    expect(cols.fields.map((f) => f.name)).not.toContain("email");
  });
});

describe("cancellation workflow", () => {
  it("students can only request cancellation; an admin cancels and reopens closed matches", async () => {
    const a = await createStudent(db, "A");
    const b = await createStudent(db, "B");
    const c = await createStudent(db, "C");
    const ab = await mutual(a, b);
    const ac = await mutual(a, c);
    await confirm(a, ab);
    await confirm(b, ab);

    // Students cannot cancel a finalised partnership themselves.
    expect(await errorCode(rpc(db, a, "decline_match", [ab]))).toContain("MATCH_NOT_OPEN");
    expect(await errorCode(rpc(db, a, "admin_cancel_partnership", [ab, "x"]))).toContain("FORBIDDEN");
    expect(await errorCode(rpc(db, a, "request_partnership_cancellation", [ab, ""]))).toContain("REASON_REQUIRED");
    await rpc(db, a, "request_partnership_cancellation", [ab, "Schedules are incompatible"]);

    const { createAdmin } = await import("./harness");
    const admin = await createAdmin(db);
    await rpc(db, admin, "admin_cancel_partnership", [ab, "Both students agreed in a meeting"]);

    const ms = await db.query<{ id: string; status: string }>("select id, status from public.matches where id in ($1,$2)", [ab, ac]);
    const byId = Object.fromEntries(ms.rows.map((r) => [r.id, r.status]));
    expect(byId[ab]).toBe("cancelled");
    expect(byId[ac]).toBe("mutual");
    const members = await db.query("select 1 from public.partnership_members where match_id=$1", [ab]);
    expect(members.rows).toHaveLength(0);
    const audit = await db.query<{ action: string }>("select action from public.audit_log where subject_id=$1 order by id", [ab]);
    expect(audit.rows.map((r) => r.action)).toContain("partnership_cancelled");
  });
});
