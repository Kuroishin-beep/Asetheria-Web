import { test, expect } from "@playwright/test";
import { loadEnv } from "./load-env";

loadEnv();

const DM_USER = process.env.DM_USERNAME!;
const DM_PASS = process.env.DM_PASSWORD!;
const PLAYER_USER = process.env.PLAYER_USERNAME!;
const PLAYER_PASS = process.env.PLAYER_PASSWORD!;

test.describe("login form polish", () => {
  test("submit is disabled until both fields have a value", async ({ page }) => {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Enter" });
    await expect(submit).toBeDisabled();
    await page.fill("#username", "someone");
    await expect(submit).toBeDisabled();
    await page.fill("#password", "whatever12345");
    await expect(submit).toBeEnabled();
  });

  test("the show/hide toggle reveals and re-hides the password", async ({ page }) => {
    await page.goto("/login");
    const passwordInput = page.locator("#password");
    await page.fill("#password", "secret-value");
    await expect(passwordInput).toHaveAttribute("type", "password");

    const toggle = page.getByRole("button", { name: /show password/i });
    await toggle.click();
    await expect(passwordInput).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: /hide password/i })).toBeVisible();

    await page.getByRole("button", { name: /hide password/i }).click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("a failed login returns focus to the username field", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", DM_USER);
    await page.fill("#password", "wrong-password");
    await page.getByRole("button", { name: "Enter" }).click();
    await expect(page.locator('p[role="alert"]')).toBeVisible();
    await expect(page.locator("#username")).toBeFocused();
  });
});

test.describe("login form", () => {
  test("valid DM login reaches the dashboard with full controls", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", DM_USER);
    await page.fill("#password", DM_PASS);
    await page.getByRole("button", { name: "Enter" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("link", { name: /^New/ })).toBeVisible();
    await expect(page.getByText("⚜ DM")).toBeVisible();
  });

  test("valid player login reaches the dashboard read-only", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", PLAYER_USER);
    await page.fill("#password", PLAYER_PASS);
    await page.getByRole("button", { name: "Enter" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("link", { name: /^New/ })).toHaveCount(0);
    await expect(page.getByText("☗ Player")).toBeVisible();
  });

  test("wrong password shows a generic error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", DM_USER);
    await page.fill("#password", "definitely-wrong-password");
    await page.getByRole("button", { name: "Enter" }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText(/incorrect username or password/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("unknown username shows the same generic error (no user enumeration)", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", `nobody-${Date.now()}`);
    await page.fill("#password", "whatever12345");
    await page.getByRole("button", { name: "Enter" }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText(/incorrect username or password/i);
  });

  test("unauthenticated visit to a protected page redirects to /login with ?next=", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  });

  test("open-redirect guard: a cross-site next param is not honored", async ({ page }) => {
    await page.goto("/login?next=//evil.example.com");
    await page.fill("#username", DM_USER);
    await page.fill("#password", DM_PASS);
    const [response] = await Promise.all([
      page.waitForResponse("**/api/auth/login"),
      page.getByRole("button", { name: "Enter" }).click(),
    ]);
    expect(response.ok()).toBe(true);
    await page.waitForURL((url) => url.pathname !== "/login");
    expect(page.url()).not.toContain("evil.example.com");
  });

  test("logging in then visiting /login again bounces back to /", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", DM_USER);
    await page.fill("#password", DM_PASS);
    await page.getByRole("button", { name: "Enter" }).click();
    await page.waitForURL("/");
    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });

  test("logout clears the session and protected pages redirect again", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", DM_USER);
    await page.fill("#password", DM_PASS);
    await page.getByRole("button", { name: "Enter" }).click();
    await page.waitForURL("/");
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("login throttle", () => {
  test("repeated failed attempts eventually 429s", async ({ page }) => {
    const throttleUser = `throttle-check-${Date.now()}`;
    let sawThrottle = false;
    for (let i = 0; i < 10; i++) {
      const res = await page.request.post("/api/auth/login", {
        data: { username: throttleUser, password: "wrong" },
      });
      if (res.status() === 429) {
        sawThrottle = true;
        const body = await res.json();
        expect(body.error).toMatch(/too many attempts/i);
        break;
      }
      expect(res.status()).toBe(401);
    }
    expect(sawThrottle).toBe(true);
  });

  test("throttled state renders with a distinct, calmer tone than a wrong password", async ({
    page,
  }) => {
    const throttleUser = `throttle-tone-${Date.now()}`;
    await page.goto("/login");

    let sawThrottle = false;
    for (let i = 0; i < 10 && !sawThrottle; i++) {
      await page.fill("#username", throttleUser);
      await page.fill("#password", "wrong-password");
      await page.getByRole("button", { name: "Enter" }).click();
      const alert = page.locator('p[role="alert"]');
      await expect(alert).toBeVisible();
      if ((await alert.getAttribute("data-variant")) === "throttle") {
        sawThrottle = true;
        await expect(alert).toHaveText(/too many attempts/i);
      }
    }
    expect(sawThrottle).toBe(true);
  });
});
