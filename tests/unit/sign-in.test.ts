import { describe, expect, it, vi } from "vitest";
import { hashIp, hashSessionToken, hashSignInCode, newSessionToken, newSignInCode } from "@/lib/auth/crypto";
import { sendSignInCode, signInEmail } from "@/lib/email/resend";

const KEY = "k".repeat(40);

describe("sign-in secrets", () => {
  it("codes are 6 digits; tokens are long and random", () => {
    for (let i = 0; i < 50; i++) expect(newSignInCode()).toMatch(/^\d{6}$/);
    const a = newSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(a);
  });

  it("hashes are keyed, deterministic and bound to the email", () => {
    expect(hashSignInCode("a@pg27.mesaschool.co", "123456", KEY)).toBe(hashSignInCode("A@PG27.mesaschool.co ", "123456", KEY));
    expect(hashSignInCode("a@pg27.mesaschool.co", "123456", KEY)).not.toBe(hashSignInCode("b@pg27.mesaschool.co", "123456", KEY));
    expect(hashSignInCode("a@pg27.mesaschool.co", "123456", KEY)).not.toBe(
      hashSignInCode("a@pg27.mesaschool.co", "123456", "x".repeat(40)),
    );
    expect(hashSessionToken("t")).toHaveLength(64);
    expect(hashIp(null, KEY)).toBeNull();
    expect(hashIp("1.2.3.4", KEY)).not.toContain("1.2.3.4");
  });
});

describe("Resend email", () => {
  it("sends only the code — no profile data — from the configured sender", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    const res = await sendSignInCode("s@pg27.mesaschool.co", "123456", {
      apiKey: "re_test",
      from: "BSL <noreply@example.com>",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res).toEqual({ ok: true, id: "em_1" });
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ from: "BSL <noreply@example.com>", to: ["s@pg27.mesaschool.co"] });
    expect(body.subject).toContain("123456");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
  });

  it("retries transient failures and reports permanent ones without retrying", async () => {
    const flaky = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "em_2" }), { status: 200 }));
    const okRes = await sendSignInCode("s@pg27.mesaschool.co", "123456", { apiKey: "k", from: "f@x.co", fetchImpl: flaky as unknown as typeof fetch });
    expect(okRes.ok).toBe(true);
    const rejected = vi.fn(async () => new Response(JSON.stringify({ name: "validation_error" }), { status: 422 }));
    const res = await sendSignInCode("s@pg27.mesaschool.co", "123456", { apiKey: "k", from: "f@x.co", fetchImpl: rejected as unknown as typeof fetch });
    expect(res.ok).toBe(false);
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it("only ever renders a 6-digit code", () => {
    expect(() => signInEmail("<script>")).toThrow();
    expect(signInEmail("000123").html).toContain("000123");
  });
});
