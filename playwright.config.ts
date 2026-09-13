import { defineConfig, devices } from "@playwright/test";

/**
 * Runs only against the local, disposable Postgres container
 * (see .env.local / docker container "asetheria-test-pg"). Never point
 * BASE_URL or DATABASE_URL at the Neon production database.
 *
 * Auth state is not set at the project level — each spec opts into
 * "tests/.auth/dm.json" or "tests/.auth/player.json" via test.use(), or
 * runs anonymously by default. This keeps every spec running once instead
 * of multiplying by role.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./tests/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
