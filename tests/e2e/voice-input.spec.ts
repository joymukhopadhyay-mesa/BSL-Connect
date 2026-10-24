import { expect, test, type Page } from "@playwright/test";

/**
 * Voice dictation on the onboarding form. Chromium's fake microphone stands
 * in for a real one and /api/ai/transcribe is mocked, so no AI account is
 * contacted. Runs on the design preview (sample data, AI treated as on).
 */
test.use({
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

const URL_STEP1 = "/design-preview?view=onboarding&step=1";
const MIC = /^Dictate your answer by voice: A little about how I work/;
const TRANSCRIPT = "I enjoy turning messy problems into a clear plan.";

async function noHorizontalOverflow(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll).toBeLessThanOrEqual(width);
}

function mockTranscribe(page: Page, respond: { status?: number; body: unknown }) {
  const seen: Array<{ method: string; contentType: string; body: Buffer | null }> = [];
  return page
    .route("**/api/ai/transcribe", async (route) => {
      const req = route.request();
      seen.push({ method: req.method(), contentType: req.headers()["content-type"] ?? "", body: req.postDataBuffer() });
      await route.fulfill({ status: respond.status ?? 200, contentType: "application/json", body: JSON.stringify(respond.body) });
    })
    .then(() => seen);
}

const intro = (page: Page) => page.getByRole("textbox", { name: /A little about how I work/ });

test("the microphone is hidden when AI is unavailable", async ({ page }) => {
  await page.goto(`${URL_STEP1}&ai=off`);
  await expect(intro(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /Dictate your answer by voice/ })).toHaveCount(0);
  await expect(page.getByText(/AI writing suggestions are unavailable/).first()).toBeVisible();
  await intro(page).fill("Typing still works.");
  await expect(intro(page)).toHaveValue("Typing still works.");
});

test("the microphone is hidden when the browser can't record, and typing still works", async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error simulate a browser without MediaRecorder
    delete window.MediaRecorder;
  });
  await page.goto(URL_STEP1);
  await expect(intro(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /Dictate your answer by voice/ })).toHaveCount(0);
  await intro(page).fill("Typing still works.");
  await expect(intro(page)).toHaveValue("Typing still works.");

  const page2 = await page.context().newPage();
  await page2.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
  });
  await page2.goto(URL_STEP1);
  await expect(page2.getByRole("textbox", { name: /A little about how I work/ })).toBeVisible();
  await expect(page2.getByRole("button", { name: /Dictate your answer by voice/ })).toHaveCount(0);
});

test("record, stop, and the transcript is appended to existing text and stays editable", async ({ page }, info) => {
  const seen = await mockTranscribe(page, { body: { text: TRANSCRIPT, unclear: false, truncated: false } });
  await page.goto(URL_STEP1);
  await expect(page.getByRole("button", { name: MIC })).toBeVisible(); // visible only once hydrated
  await intro(page).fill("I work in marketing.");

  const mic = page.getByRole("button", { name: MIC });
  await expect(mic).toBeVisible();
  const box = await mic.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await noHorizontalOverflow(page);

  // First use: the privacy note appears before any recording starts.
  await mic.click();
  const note = page.getByRole("group", { name: "About voice dictation" });
  await expect(note).toContainText(/sent to our AI provider/);
  await expect(note).toContainText(/isn.t stored/);
  expect(seen).toHaveLength(0);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/voice-note-${info.project.name}.png` });
  await note.getByRole("button", { name: "Start recording" }).click();

  // Recording: visible timer, stop button, nothing sent yet.
  const stop = page.getByRole("button", { name: /^Stop recording and add the text to/ });
  await expect(stop).toBeVisible();
  await expect(page.getByTestId("voice-timer")).toHaveText(/0:0\d \/ 1:30/);
  await expect(page.getByRole("status").filter({ hasText: "Recording." })).toBeAttached();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/voice-recording-${info.project.name}.png` });
  await page.waitForTimeout(2200);
  await stop.click();

  await expect(intro(page)).toHaveValue(`I work in marketing. ${TRANSCRIPT}`);
  await expect(page.getByText(/Added to your answer/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: MIC })).toBeEnabled();
  expect(seen).toHaveLength(1);
  expect(seen[0]!.method).toBe("POST");
  expect(seen[0]!.contentType).toMatch(/^multipart\/form-data/);
  expect(seen[0]!.body!.includes(Buffer.from("RIFF"))).toBe(true);
  expect(seen[0]!.body!.includes(Buffer.from("WAVE"))).toBe(true);
  expect(seen[0]!.body!.length).toBeLessThan(3.2 * 1024 * 1024);

  // The text is a normal field value: the student can edit it.
  await intro(page).fill(`I work in marketing. ${TRANSCRIPT} Edited by hand.`);
  await expect(intro(page)).toHaveValue(/Edited by hand\.$/);

  // The privacy note is not shown a second time.
  await page.getByRole("button", { name: MIC }).click();
  await expect(note).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Stop recording/ })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: MIC })).toBeVisible();
  expect(seen).toHaveLength(1); // cancelled recordings are never uploaded
  await noHorizontalOverflow(page);
});

test("keyboard operable and respects the length limit", async ({ page }) => {
  await mockTranscribe(page, { body: { text: "word ".repeat(300).trim(), unclear: false, truncated: false } });
  await page.addInitScript(() => window.localStorage.setItem("bsl-voice-note-seen", "1"));
  await page.goto(URL_STEP1);
  await expect(page.getByRole("button", { name: MIC })).toBeVisible();
  await intro(page).fill("Start.");
  const mic = page.getByRole("button", { name: MIC });
  await mic.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Stop recording/ })).toBeFocused();
  await page.waitForTimeout(2200);
  await page.keyboard.press("Space");
  await expect(page.getByText(/Added as much as fits/).first()).toBeVisible();
  const value = await intro(page).inputValue();
  expect(value.startsWith("Start. word word")).toBe(true);
  expect(value.length).toBeLessThanOrEqual(700);
});

test("clear messages for 'couldn't hear you', busy AI and the hourly limit", async ({ page }, info) => {
  await page.addInitScript(() => window.localStorage.setItem("bsl-voice-note-seen", "1"));
  const cases = [
    { status: 422, body: { error: "We couldn't make out any words. Try again somewhere quieter, a little closer to the microphone.", code: "NO_SPEECH" }, text: /couldn't make out any words/ },
    { status: 429, body: { error: "You've reached the hourly limit for voice dictation. You can keep typing, or try again later." }, text: /hourly limit for voice dictation/ },
    { status: 503, body: { error: "AI assistance isn't available right now." }, text: /isn't available right now/ },
  ];
  await page.goto(URL_STEP1);
  await expect(page.getByRole("button", { name: MIC })).toBeVisible();
  await intro(page).fill("Original text stays.");
  for (const c of cases) {
    await page.unroute("**/api/ai/transcribe").catch(() => {});
    await mockTranscribe(page, { status: c.status, body: c.body });
    await page.getByRole("button", { name: MIC }).click();
    await page.waitForTimeout(1800);
    await page.getByRole("button", { name: /^Stop recording/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: c.text })).toBeVisible();
    await expect(intro(page)).toHaveValue("Original text stays.");
    await noHorizontalOverflow(page);
  }
  await page.screenshot({ path: `screenshots/voice-error-${info.project.name}.png` });
});

test("microphone permission denied and no microphone are explained", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bsl-voice-note-seen", "1"));
  await page.addInitScript(() => {
    (window as unknown as { __gumError: string }).__gumError = "NotAllowedError";
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("x", (window as unknown as { __gumError: string }).__gumError));
  });
  await page.goto(URL_STEP1);
  await page.getByRole("button", { name: MIC }).click();
  await expect(page.getByRole("alert").filter({ hasText: /.+/ })).toContainText(/Microphone access is blocked/);
  await expect(page.getByRole("button", { name: MIC })).toBeEnabled();
  await noHorizontalOverflow(page);

  await page.evaluate(() => ((window as unknown as { __gumError: string }).__gumError = "NotFoundError"));
  await page.getByRole("button", { name: MIC }).click();
  await expect(page.getByRole("alert").filter({ hasText: /.+/ })).toContainText(/No microphone was found/);
});

test("microphone is also offered on the questionnaire notes", async ({ page }) => {
  await page.goto("/design-preview?view=onboarding&step=5");
  await page.getByRole("button", { name: "Add a note" }).first().click();
  await expect(page.getByRole("button", { name: /^Dictate your answer by voice: Note on/ })).toBeVisible();
  await noHorizontalOverflow(page);
});

test("the permissions policy allows the microphone for this site only", async ({ request }) => {
  const res = await request.get("/sign-in");
  const policy = res.headers()["permissions-policy"];
  expect(policy).toContain("microphone=(self)");
  expect(policy).toContain("camera=()");
  expect(policy).toContain("geolocation=()");
});
