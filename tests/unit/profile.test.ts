import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { EXPORT_COLUMNS } from "@/lib/export";
import { validatePhoto, MAX_PHOTO_BYTES } from "@/lib/photo";
import { completionPercent, missingFields } from "@/lib/profile/completion";
import { basicsSchema, industriesSchema, publishSchema, questionnaireSchema, strengthsSchema } from "@/lib/profile/schema";
import { createDb } from "../db/harness";
import { makeProfile } from "./fixtures";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("photo validation", () => {
  it("accepts JPEG, PNG and WebP by their bytes", () => {
    expect(validatePhoto(JPEG, "image/jpeg")).toEqual({ ok: true, contentType: "image/jpeg" });
    expect(validatePhoto(PNG, "image/png")).toEqual({ ok: true, contentType: "image/png" });
    expect(validatePhoto(WEBP, null)).toEqual({ ok: true, contentType: "image/webp" });
  });
  it("rejects invalid formats, disguised files and oversized images", () => {
    const gif = new TextEncoder().encode("GIF89a....");
    expect(validatePhoto(gif, "image/gif")).toEqual({ ok: false, error: "unsupported_type" });
    expect(validatePhoto(new TextEncoder().encode("<svg onload=alert(1)>"), "image/jpeg")).toEqual({ ok: false, error: "unsupported_type" });
    expect(validatePhoto(PNG, "image/jpeg")).toEqual({ ok: false, error: "mismatched_type" });
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(JPEG);
    expect(validatePhoto(big, "image/jpeg")).toEqual({ ok: false, error: "too_large" });
    expect(validatePhoto(new Uint8Array(), "image/jpeg")).toEqual({ ok: false, error: "empty" });
  });
});

describe("profile step validation", () => {
  it("trims text, converts blanks to null and bounds lengths", () => {
    const r = basicsSchema.parse({ full_name: "  Asha  ", intro: "   ", years_experience: "2.25" });
    expect(r.full_name).toBe("Asha");
    expect(r.intro).toBeNull();
    expect(r.years_experience).toBe(2.3);
    expect(basicsSchema.safeParse({ intro: "x".repeat(800) }).success).toBe(false);
    expect(basicsSchema.safeParse({ years_experience: 99 }).success).toBe(false);
    expect(basicsSchema.safeParse({ career_objective: "astronaut" }).success).toBe(false);
  });

  it("de-duplicates custom tags and enforces limits", () => {
    const r = strengthsSchema.parse({ strengths: ["Finance", " finance ", "Pricing strategy", ""] });
    expect(r.strengths).toEqual(["Finance", "Pricing strategy"]);
    expect(strengthsSchema.safeParse({ strengths: Array.from({ length: 13 }, (_, i) => `Skill ${i}`) }).success).toBe(false);
  });

  it("keeps industries of experience and interest separate and closed-vocabulary", () => {
    const r = industriesSchema.parse({ industries_experience: ["Healthcare"], industries_interest: ["B2B SaaS"] });
    expect(r.industries_experience).toEqual(["Healthcare"]);
    expect(r.industries_interest).toEqual(["B2B SaaS"]);
    expect(industriesSchema.safeParse({ industries_experience: ["Space piracy"], industries_interest: [] }).success).toBe(false);
  });

  it("validates questionnaire answers against the defined options", () => {
    const ok = questionnaireSchema.parse({ answers: { working_style: "structured", pressure: ["clear_priorities"], unknown_q: "x" }, notes: { working_style: "  context  " } });
    expect(ok).toEqual({ answers: { working_style: "structured", pressure: ["clear_priorities"] }, notes: { working_style: "context" } });
    expect(questionnaireSchema.safeParse({ answers: { working_style: "best" } }).success).toBe(false);
    expect(questionnaireSchema.safeParse({ answers: { pressure: ["clear_priorities", "focused_time", "short_breaks", "frequent_syncs"] } }).success).toBe(false);
  });

  it("requires every publication confirmation", () => {
    expect(publishSchema.safeParse({ details_confirmed: true, photo_confirmed: true, visibility_acknowledged: true }).success).toBe(true);
    expect(publishSchema.safeParse({ details_confirmed: true, photo_confirmed: true, visibility_acknowledged: false }).success).toBe(false);
  });
});

describe("profile completeness", () => {
  it("TypeScript and SQL implementations agree", async () => {
    const db = await createDb();
    const cases = [
      makeProfile(),
      makeProfile({ intro: "" }),
      makeProfile({ strengths: [], photo_path: null }),
      makeProfile({ questionnaire: { answers: { working_style: "structured" } } }),
      makeProfile({ visibility_acknowledged: false, details_confirmed: false, photo_confirmed: false }),
    ];
    for (const p of cases) {
      const row = await db.query<{ m: string[] }>(
        `select private.profile_missing_fields(row(
          $1::uuid, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10::text[], $11, $12, $13, $14::text[], $15, $16, $17,
          $18::text[], $19, $20::text[], $21::jsonb, $22::text[], $23::text[], $24::text[], $25, $26, $27, $28::timestamptz,
          $29, $30, $31::smallint, $32, $33::timestamptz, $34, $35::timestamptz, $36::timestamptz
        )::public.profiles) as m`,
        [
          p.id, p.full_name, p.cohort, p.role_title, p.background, p.years_experience, p.career_objective, p.career_objective_detail,
          p.intro, p.strengths, p.strengths_good_at, p.strengths_problems, p.strengths_example, p.development_areas,
          p.development_current, p.development_complement, p.development_help, p.industries_experience,
          p.industries_experience_detail, p.industries_interest, JSON.stringify(p.questionnaire), p.partner_skills,
          p.partner_industries, p.partner_qualities, p.partner_success, null, p.photo_confirmed, null, p.details_confirmed,
          p.visibility_acknowledged, p.onboarding_step, p.status, null, p.version, p.created_at, p.updated_at,
        ].map((v, i) => (i === 25 ? (p.photo_path ? `${p.id}/avatar` : null) : v)),
      );
      expect(row.rows[0]!.m.sort()).toEqual(missingFields(p).sort());
    }
  });

  it("computes progress", () => {
    expect(completionPercent(makeProfile())).toBe(100);
    expect(completionPercent(makeProfile({ intro: null }))).toBeLessThan(100);
  });
});

describe("CSV export", () => {
  it("escapes values and neutralises spreadsheet formulas", () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'He said "hi", then left\n' }], [{ key: "a", header: "A" }, { key: "b", header: "B" }]);
    expect(csv).toBe('A,B\r\n"\'=HYPERLINK(""x"")","He said ""hi"", then left\n"\r\n');
  });

  it("exports only permitted columns", () => {
    const keys = EXPORT_COLUMNS.map((c) => c.key).join(",");
    for (const forbidden of ["token", "password", "likes", "report", "suspend", "questionnaire", "development", "note"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
