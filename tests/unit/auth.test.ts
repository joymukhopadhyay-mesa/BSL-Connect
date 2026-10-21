import { describe, expect, it } from "vitest";
import { checkEmail, isAllowedStudentEmail } from "@/lib/auth/domain";
import { safeNextPath } from "@/lib/auth/redirect";
import { errorCodeFrom, friendlyError, GENERIC_ERROR } from "@/lib/errors";

describe("MESA email domain validation", () => {
  it.each(["a.b@pg27.mesaschool.co", "A.B@PG27.MESASCHOOL.CO", "  first.last@pg27.mesaschool.co  "])("accepts %s", (email) => {
    expect(isAllowedStudentEmail(email)).toBe(true);
  });

  it.each([
    ["personal Gmail", "student@gmail.com"],
    ["parent domain", "student@mesaschool.co"],
    ["suffix attack", "student@pg27.mesaschool.co.evil.com"],
    ["prefix attack", "student@evilpg27.mesaschool.co"],
    ["sub-domain", "student@sub.pg27.mesaschool.co"],
    ["wrong TLD", "student@pg27.mesaschool.com"],
    ["domain in local part", "pg27.mesaschool.co@gmail.com"],
    ["two @", "a@b@pg27.mesaschool.co"],
    ["whitespace inside", "a b@pg27.mesaschool.co"],
    ["empty", ""],
  ])("rejects %s", (_label, email) => {
    expect(isAllowedStudentEmail(email)).toBe(false);
  });

  it("explains why an address is rejected", () => {
    expect(checkEmail("")).toEqual({ ok: false, reason: "empty" });
    expect(checkEmail("not-an-email")).toEqual({ ok: false, reason: "invalid" });
    expect(checkEmail("x@gmail.com")).toEqual({ ok: false, reason: "domain" });
    expect(checkEmail("X@PG27.mesaschool.co")).toEqual({ ok: true, email: "x@pg27.mesaschool.co" });
  });
});

describe("post-login redirects", () => {
  it("allows same-origin paths only", () => {
    expect(safeNextPath("/discover")).toBe("/discover");
    expect(safeNextPath("/students/abc")).toBe("/students/abc");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/auth/confirm", "/sign-in", null, ""]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});

describe("error mapping", () => {
  it("maps database codes to friendly copy and hides unknown errors", () => {
    expect(friendlyError({ message: "SELF_ACTION" })).toMatch(/your own profile/);
    expect(errorCodeFrom({ message: "ALREADY_PARTNERED" })).toBe("ALREADY_PARTNERED");
    expect(friendlyError({ message: 'relation "secret_table" does not exist' })).toBe(GENERIC_ERROR);
    expect(friendlyError(null)).toBe(GENERIC_ERROR);
  });
});
