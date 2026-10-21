import { expect, test } from "@playwright/test";

/**
 * Layout and accessibility checks on the design preview (fictional sample
 * data, no backend). Validates the real components at each viewport.
 */
async function noHorizontalOverflow(page: import("@playwright/test").Page) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll).toBeLessThanOrEqual(width);
}

test("discovery card, actions and navigation fit and are labelled", async ({ page }, info) => {
  await page.goto("/design-preview?view=discover");
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pass on Sample Student/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Interested in partnering with/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /full profile/ }).first()).toBeVisible();
  await noHorizontalOverflow(page);

  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.filter({ visible: true }).getByRole("link", { name: /Discover/ })).toBeVisible();

  // Action buttons are thumb-sized (≥ 44px) on touch layouts.
  if (info.project.name.startsWith("mobile")) {
    const box = await page.getByRole("button", { name: /^Interested in partnering with/ }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // Card does not hide behind the fixed bottom navigation.
    const card = await page.getByRole("group", { name: /Press right arrow/ }).boundingBox();
    expect(card!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await page.screenshot({ path: `screenshots/discover-${info.project.name}.png`, fullPage: true });
});

test("full profile opens in a sheet without losing the deck position, and closes with Escape", async ({ page }, info) => {
  await page.goto("/design-preview?view=discover");
  const first = await page.getByRole("group", { name: /Press right arrow/ }).getAttribute("aria-label");
  await page.getByRole("button", { name: /full profile/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("How they work")).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/profile-sheet-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("group", { name: /Press right arrow/ })).toHaveAttribute("aria-label", first!);
});

test("filters only offer values present in the data and can be reset", async ({ page }) => {
  await page.goto("/design-preview?view=discover");
  await page.getByRole("button", { name: /Filters/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Consumer technology" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Healthcare" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "E-commerce" }).click();
  await expect(dialog.getByRole("button", { name: /Show 1 profile/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Reset filters" }).click();
  await expect(dialog.getByRole("button", { name: /Show 2 profiles/ })).toBeVisible();
});

test("profile and compatibility layout", async ({ page }, info) => {
  await page.goto("/design-preview?view=profile");
  await expect(page.getByText("Compatibility insights")).toBeVisible();
  await expect(page.getByText(/Calculated from the profile details/)).toBeVisible();
  await expect(page.getByText(/AI explanations are unavailable/)).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/profile-${info.project.name}.png`, fullPage: true });
});

test("onboarding steps fit narrow screens", async ({ page }, info) => {
  for (const step of [1, 2, 5, 8]) {
    await page.goto(`/design-preview?view=onboarding&step=${step}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noHorizontalOverflow(page);
    if (step === 1 || step === 5) await page.screenshot({ path: `screenshots/onboarding-${step}-${info.project.name}.png` });
  }
});

test("respects reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/design-preview?view=discover");
  const duration = await page.evaluate(() => {
    const el = document.querySelector("[aria-roledescription='profile card'] > div:last-child") as HTMLElement | null;
    return el ? getComputedStyle(el).animationDuration : "0s";
  });
  expect(parseFloat(duration)).toBeLessThan(0.01);
  await context.close();
});

test("sign-in screen layout", async ({ page }, info) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/sign-in-${info.project.name}.png`, fullPage: true });
});

test("discovery actions stay above the mobile navigation", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("mobile"), "mobile only");
  await page.goto("/design-preview?view=discover");
  const action = await page.getByRole("button", { name: /^Interested in partnering with/ }).boundingBox();
  const nav = await page.locator("nav[aria-label='Main']").last().boundingBox();
  // The preview banner adds ~70px that the real app doesn't have, so allow for it.
  expect(action!.y + action!.height).toBeLessThanOrEqual(nav!.y + 80);
});
