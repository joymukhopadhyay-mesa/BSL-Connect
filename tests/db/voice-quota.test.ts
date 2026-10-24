import { beforeAll, describe, expect, it } from "vitest";
import { createDb, createStudent, errorCode, rpc, asUser, type Db } from "./harness";

let db: Db;
beforeAll(async () => {
  db = await createDb();
});

describe("voice transcription quota", () => {
  it("allows 40 recordings per hour per student and then refuses", async () => {
    const s = await createStudent(db);
    let allowed = 0;
    for (let i = 0; i < 45; i++) {
      if (await rpc<boolean>(db, s, "consume_ai_quota", ["voice_transcription"])) allowed++;
    }
    expect(allowed).toBe(40);
  });

  it("is counted separately from the coach and pair-insight limits, and per student", async () => {
    const a = await createStudent(db);
    const b = await createStudent(db);
    for (let i = 0; i < 40; i++) await rpc(db, a, "consume_ai_quota", ["voice_transcription"]);
    expect(await rpc<boolean>(db, a, "consume_ai_quota", ["voice_transcription"])).toBe(false);
    expect(await rpc<boolean>(db, a, "consume_ai_quota", ["profile_coach"])).toBe(true);
    expect(await rpc<boolean>(db, b, "consume_ai_quota", ["voice_transcription"])).toBe(true);
  });

  it("only counts the last hour", async () => {
    const s = await createStudent(db);
    for (let i = 0; i < 40; i++) await rpc(db, s, "consume_ai_quota", ["voice_transcription"]);
    expect(await rpc<boolean>(db, s, "consume_ai_quota", ["voice_transcription"])).toBe(false);
    await db.query("update public.ai_usage set created_at = now() - interval '61 minutes' where user_id = $1", [s]);
    expect(await rpc<boolean>(db, s, "consume_ai_quota", ["voice_transcription"])).toBe(true);
  });

  it("still rejects unknown features and signed-out callers, and keeps the table closed to students", async () => {
    const s = await createStudent(db);
    expect(await errorCode(rpc(db, s, "consume_ai_quota", ["something_else"]))).toContain("INVALID_FEATURE");
    expect(await errorCode(rpc(db, null, "consume_ai_quota", ["voice_transcription"]))).toBeTruthy();
    await expect(asUser(db, s, () => db.query("select * from public.ai_usage"))).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.ai_usage (user_id, feature) values ($1, 'karaoke')", [s])).rejects.toThrow();
  });
});
