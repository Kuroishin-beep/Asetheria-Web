import { test, expect } from "@playwright/test";

test.describe("/api/health", () => {
  test("[TC-HEALTH-001] is public and reports the database as up", async ({ page }) => {
    // No storageState — this must work unauthenticated, the same way
    // /api/auth/login and /login do (see proxy.ts's PUBLIC_PATHS,
    // which referenced this route before it existed).
    const res = await page.request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, db: "up" });
  });
});
