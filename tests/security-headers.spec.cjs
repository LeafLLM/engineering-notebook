const { test, expect } = require("@playwright/test");

test("deployment policy loads the app and blocks injected inline scripts and unapproved connections", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.policyViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.policyViolations.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      });
    });
  });
  const response = await page.goto("/");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  await expect(page.locator("#sign-in-status")).toContainText(
    "Sign in or create",
  );
  expect(await page.evaluate(() => window.policyViolations)).toEqual([]);

  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.injectedScriptRan = true";
    document.body.append(script);
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.policyViolations.some(
          (item) => item.directive === "script-src-elem",
        ),
      ),
    )
    .toBe(true);
  expect(await page.evaluate(() => window.injectedScriptRan)).toBeUndefined();
  const blocked = await page.evaluate(async () => {
    try {
      await fetch("https://unapproved.example.test/");
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.policyViolations.some(
          (item) => item.directive === "connect-src",
        ),
      ),
    )
    .toBe(true);
});
