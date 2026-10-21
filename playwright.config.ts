import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests that run without a live database: they cover public
 * pages, route protection, API authorisation, and responsive layout of the
 * design preview. The database URL below is a placeholder that is never
 * contacted by these tests — no real credentials are used.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "mobile-320", use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 640 }, hasTouch: true } },
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, hasTouch: true } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/setup`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: "postgresql://placeholder:placeholder@127.0.0.1:59999/placeholder",
      AUTH_SECRET: "e2e-placeholder-secret-0123456789abcdef",
      RESEND_API_KEY: "",
      OPENROUTER_API_KEY: "",
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
      ENABLE_DESIGN_PREVIEW: "true",
      AI_PROVIDER: "none",
      // Keep .env.local secrets out of the test server.
      EMAIL_FROM: "",
    },
  },
});
