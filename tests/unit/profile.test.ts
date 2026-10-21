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
    const r = basicsSchema.parse({ full_name: "  Asha  ", intro: "   ", years_experience: "2.25", career_objectives: [] });
    expect(r.full_name).toBe("Asha");
    expect(r.intro).toBeNull();
    expect(r.years_experience).toBe(2.3);
    expect(basicsSchema.safeParse({ intro: "x".repeat(800), career_objectives: [] }).success).toBe(false);
    expect(basicsSchema.safeParse({ years_experience: 99, career_objectives: [] }).success).toBe(false);
  });

  it("career objectives: several presets plus free text, de-duplicated and bounded", () => {
    const r = basicsSchema.parse({
      career_objectives: ["consulting", "product", "Consulting", " Founder's Office - Generalist, AI Generalist roles ", ""],
    });
    expect(r.career_objectives).toEqual(["consulting", "product", "Founder's Office - Generalist, AI Generalist roles"]);
    expect(basicsSchema.safeParse({ career_objectives: Array.from({ length: 7 }, (_, i) => `Outcome ${i}`) }).success).toBe(false);
    expect(basicsSchema.safeParse({ career_objectives: ["x".repeat(81)] }).success).toBe(false);
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
      makeProfile({ career_objectives: [] }),
      makeProfile({ strengths: [], photo_path: null }),
      makeProfile({ questionnaire: { answers: { working_style: "structured" } } }),
      makeProfile({ visibility_acknowledged: false, details_confirmed: false, photo_confirmed: false }),
    ];
    for (const p of cases) {
      const row = await db.query<{ m: string[] }>(
        "select private.profile_missing_fields(jsonb_populate_record(null::public.profiles, $1::jsonb)) as m",
        [JSON.stringify({ ...p, photo_path: p.photo_path ? `${p.id}/avatar` : null })],
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
