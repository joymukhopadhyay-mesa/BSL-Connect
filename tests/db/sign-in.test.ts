import { beforeAll, describe, expect, it } from "vitest";
import { hashSessionToken, hashSignInCode } from "../../src/lib/auth/crypto";
import { UserDb } from "../../src/lib/db/executor";
import { createAdmin, createDb, createStudent, errorCode, pgliteExecutor, type Db } from "./harness";

const KEY = "test-secret-test-secret-test-secret-123";
let db: Db;
let seq = 0;

beforeAll(async () => {
  db = await createDb();
});

const email = () => `signin${++seq}.${Date.now()}@pg27.mesaschool.co`;

async function request(addr: string, code: string, ip = "ip-a") {
  const res = await db.query<{ r: { status: string; id?: string } }>("select auth.request_otp($1, $2, $3, 600) as r", [
    addr,
    hashSignInCode(addr, code, KEY),
    ip,
  ]);
  return res.rows[0]!.r;
}

async function verify(addr: string, code: string, token = `tok-${Math.random()}`) {
  const res = await db.query<{ r: { status: string; user_id?: string; attempts_left?: number } }>(
    "select auth.verify_otp($1, $2, $3, 2592000, 'vitest') as r",
    [addr, hashSignInCode(addr, code, KEY), hashSessionToken(token)],
  );
  return { ...res.rows[0]!.r, token };
}

describe("email code sign-in (auth.request_otp / auth.verify_otp)", () => {
  it("refuses codes for non-MESA addresses and look-alike domains", async () => {
    for (const addr of ["someone@gmail.com", "x@pg27.mesaschool.co.evil.com", "x@sub.pg27.mesaschool.co", "x@mesaschool.co"]) {
      expect((await request(addr, "123456")).status).toBe("not_allowed");
    }
  });

  it("allows allowlisted staff addresses", async () => {
    await db.query("select private.provision_admin('lead.coordinator@mesaschool.co')");
    expect((await request("lead.coordinator@mesaschool.co", "123456")).status).toBe("ok");
  });

  it("a correct code creates the account, a student role, a draft profile and a session", async () => {
    const addr = email();
    expect((await request(addr, "424242")).status).toBe("ok");
    const v = await verify(addr, "424242");
    expect(v.status).toBe("ok");
    const role = await db.query<{ role: string }>("select role from public.user_roles where user_id = $1", [v.user_id]);
    expect(role.rows[0]?.role).toBe("student");
    const profile = await db.query<{ status: string }>("select status from public.profiles where id = $1", [v.user_id]);
    expect(profile.rows[0]?.status).toBe("draft");
    const session = await db.query<{ user_id: string }>("select * from auth.session_user($1)", [hashSessionToken(v.token)]);
    expect(session.rows[0]?.user_id).toBe(v.user_id);
  });

  it("codes work once", async () => {
    const addr = email();
    await request(addr, "111111");
    expect((await verify(addr, "111111")).status).toBe("ok");
    expect((await verify(addr, "111111")).status).toBe("expired");
  });

  it("wrong codes count down and lock after five attempts", async () => {
    const addr = email();
    await request(addr, "222222");
    for (let i = 0; i < 5; i++) expect((await verify(addr, "999999")).status).toBe("invalid");
    expect((await verify(addr, "222222")).status).toBe("locked");
  });

  it("expired codes are rejected", async () => {
    const addr = email();
    await request(addr, "333333");
    await db.query("update auth.otp_codes set expires_at = now() - interval '1 second' where email = $1", [addr]);
    expect((await verify(addr, "333333")).status).toBe("expired");
  });

  it("a new code invalidates the previous one, and resends are rate limited", async () => {
    const addr = email();
    await request(addr, "444444");
    expect((await request(addr, "555555")).status).toBe("too_soon");
    await db.query("update auth.otp_codes set created_at = created_at - interval '2 minutes' where email = $1", [addr]);
    expect((await request(addr, "555555")).status).toBe("ok");
    expect((await verify(addr, "444444")).status).toBe("invalid");
    expect((await verify(addr, "555555")).status).toBe("ok");
  });

  it("limits codes per address per hour", async () => {
    const addr = email();
    for (let i = 0; i < 5; i++) {
      expect((await request(addr, "100000")).status).toBe("ok");
      await db.query("update auth.otp_codes set created_at = created_at - interval '61 seconds' where email = $1", [addr]);
    }
    expect((await request(addr, "100000")).status).toBe("rate_limited");
  });

  it("stores only hashes — never the code or the session token", async () => {
    const addr = email();
    await request(addr, "654321");
    const v = await verify(addr, "654321", "plain-session-token-value");
    const codes = await db.query<{ code_hash: string }>("select code_hash from auth.otp_codes where email = $1", [addr]);
    expect(codes.rows.every((r) => !r.code_hash.includes("654321"))).toBe(true);
    const sessions = await db.query<{ token_hash: string }>("select token_hash from auth.sessions where user_id = $1", [v.user_id]);
    expect(sessions.rows.every((r) => r.token_hash !== "plain-session-token-value")).toBe(true);
  });

  it("revoked and expired sessions no longer resolve", async () => {
    const addr = email();
    await request(addr, "777777");
    const v = await verify(addr, "777777");
    await db.query("select auth.revoke_session($1)", [hashSessionToken(v.token)]);
    expect((await db.query("select * from auth.session_user($1)", [hashSessionToken(v.token)])).rows).toHaveLength(0);
  });

  it("auth functions and tables are not accessible to the authenticated role", async () => {
    const s = await createStudent(db);
    const ex = pgliteExecutor(db);
    expect(await errorCode(ex.run("select * from auth.users", [], s))).toMatch(/permission denied/);
    expect(await errorCode(ex.run("select * from auth.sessions", [], s))).toMatch(/permission denied/);
    expect(await errorCode(ex.run("select auth.request_otp('a@pg27.mesaschool.co', 'x', null)", [], s))).toMatch(/permission denied/);
    expect(await errorCode(ex.run("select private.provision_admin('a@b.co')", [], s))).toMatch(/permission denied/);
  });
});

describe("production data-access path (transaction + SET LOCAL ROLE)", () => {
  it("applies RLS per user and never leaks the role to the next statement", async () => {
    const ex = pgliteExecutor(db);
    const a = await createStudent(db);
    const b = await createStudent(db);
    const adb = new UserDb(ex, a);
    await adb.rpc("record_decision", { p_target: b, p_decision: "like" });
    // a sees its own like; b cannot see a's like.
    expect(await adb.query("select * from public.likes where liker_id = $1", [a])).toHaveLength(1);
    expect(await new UserDb(ex, b).query("select * from public.likes where liker_id = $1", [a])).toHaveLength(0);
    // After a user-scoped call, the next owner-level statement runs as the owner again.
    const who = await ex.run<{ u: string }>("select current_user as u", [], null);
    expect(who[0]!.u).not.toBe("authenticated");
    // User-scoped statements run as the restricted role.
    const scoped = await adb.query<{ u: string }>("select current_user as u");
    expect(scoped[0]!.u).toBe("authenticated");
  });

  it("named-argument RPC calls reject unsafe identifiers", async () => {
    const adb = new UserDb(pgliteExecutor(db), await createStudent(db));
    await expect(adb.rpc("my_status; drop table x")).rejects.toThrow(/Invalid function name/);
    await expect(adb.rpc("my_status", { "p; drop": 1 })).rejects.toThrow(/Invalid argument name/);
  });

  it("admins provisioned by email become admin on first sign-in", async () => {
    const id = await createAdmin(db);
    const status = await new UserDb(pgliteExecutor(db), id).rpc<{ role: string }>("my_status");
    expect(status.role).toBe("admin");
  });
});
