import { expect, test } from "@playwright/test";

async function noHorizontalOverflow(page: import("@playwright/test").Page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(width);
}

test.describe("sign-in", () => {
  test("renders, explains the domain and fits the viewport", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("@pg27.mesaschool.co").first()).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test("rejects a non-MESA email before sending anything", async ({ page }) => {
    await page.goto("/sign-in");
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.getByLabel("MESA email address").fill("someone@gmail.com");
    await page.getByRole("button", { name: /email me a sign-in code/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "@pg27.mesaschool.co" })).toBeVisible();
    expect(requests.some((u) => u.includes("59999"))).toBe(false);
  });

  test("rejects look-alike domains", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("MESA email address").fill("someone@pg27.mesaschool.co.evil.com");
    await page.getByRole("button", { name: /email me a sign-in code/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "@pg27.mesaschool.co" })).toBeVisible();
  });

  test("is keyboard operable", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("MESA email address").focus();
    await page.keyboard.type("x@gmail.com");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: "@pg27.mesaschool.co" })).toBeVisible();
  });
});

test.describe("route protection (signed out)", () => {
  for (const path of ["/discover", "/shortlist", "/matches", "/me", "/settings", "/onboarding", "/partnership", "/admin", "/admin/students"]) {
    test(`${path} redirects to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in/);
    });
  }

  test("protected APIs reject unauthenticated requests", async ({ request }) => {
    const coach = await request.post("/api/ai/coach", { data: { field: "intro", text: "hello there friends" } });
    expect(coach.status()).toBe(401);
    const pair = await request.post("/api/ai/pair", { data: { candidateId: "00000000-0000-4000-8000-000000000001" } });
    expect(pair.status()).toBe(401);
    const photo = await request.post("/api/profile/photo", { multipart: { confirm: "true" } });
    expect(photo.status()).toBe(401);
    const exportCsv = await request.get("/admin/export", { maxRedirects: 0 });
    expect([302, 307, 401]).toContain(exportCsv.status());
  });

  test("photos are not served without a session", async ({ request }) => {
    const res = await request.get("/api/photos/00000000-0000-4000-8000-000000000001");
    expect(res.status()).toBe(401);
  });
});

test.describe("security headers", () => {
  test("are set on pages", async ({ request }) => {
    const res = await request.get("/sign-in");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["x-powered-by"]).toBeUndefined();
  });
});
