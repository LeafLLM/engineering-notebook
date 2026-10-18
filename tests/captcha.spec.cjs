const { test, expect } = require("@playwright/test");

// Exercise the real React integration without contacting/solving a real CAPTCHA.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let options;
    let token = "";
    window.hcaptcha = {
      render(element, props) {
        options = props;
        element.textContent = "CAPTCHA test widget";
        return "test-widget";
      },
      getResponse: () => token,
      getRespKey: () => "test-response-key",
      reset() {
        token = "";
      },
      remove() {
        token = "";
      },
      testSolve(value) {
        token = value;
        options.callback(value);
      },
      testExpire() {
        options["expired-callback"]();
      },
      testError() {
        options["error-callback"]("network-error");
      },
    };
  });
});

test("login requires a CAPTCHA, forwards its token, resets after failure and handles expiry", async ({
  page,
}) => {
  let requests = [];
  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "invalid_credentials",
        msg: "Invalid login credentials",
      }),
    });
  });
  await page.goto("/?captcha=1");
  await expect(page.locator(".account-captcha")).toContainText(
    "CAPTCHA test widget",
  );
  await page.getByLabel("Email", { exact: true }).fill("sam@example.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#sign-in-status")).toContainText(
    "Complete the CAPTCHA",
  );
  expect(requests).toHaveLength(0);
  await page.evaluate(() => hcaptcha.testSolve("login-token"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#sign-in-status")).toContainText(
    "Invalid login credentials",
  );
  expect(requests[0].gotrue_meta_security.captcha_token).toBe("login-token");
  expect(await page.evaluate(() => hcaptcha.getResponse())).toBe("");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#sign-in-status")).toContainText(
    "Complete the CAPTCHA",
  );
  expect(requests).toHaveLength(1);
  await page.evaluate(() => {
    hcaptcha.testSolve("expired-token");
    hcaptcha.testExpire();
  });
  await expect(page.getByRole("alert")).toContainText("Verification expired");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect(requests).toHaveLength(1);
  await page.evaluate(() => hcaptcha.testError());
  await expect(page.getByRole("alert")).toContainText("could not load");
  await page.getByRole("button", { name: "Retry verification" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.unroute("**/auth/v1/token?grant_type=password");
  await page.getByLabel("Password", { exact: true }).fill("notebook-test-only");
  await page.evaluate(() => hcaptcha.testSolve("fresh-login-token"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#notebook-account")).toContainText("Sam");
  await expect(page.locator(".account-captcha")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".account-captcha")).toBeVisible();
  expect(await page.evaluate(() => hcaptcha.getResponse())).toBe("");
});

test("switching modes clears verification and signup passes a fresh token on each attempt", async ({
  page,
}) => {
  const requests = [];
  await page.route("**/auth/v1/signup", async (route) => {
    requests.push(route.request().postDataJSON());
    const failed = requests.length === 1;
    await route.fulfill({
      status: failed ? 422 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        failed
          ? { msg: "Password must contain a symbol" }
          : {
              id: "10000000-0000-4000-8000-000000000088",
              email: "captcha@example.test",
              identities: [],
            },
      ),
    });
  });
  await page.goto("/?captcha=1");
  await expect(page.locator(".account-captcha")).toBeVisible();
  await page.evaluate(() => hcaptcha.testSolve("old-login-token"));
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("captcha@example.test");
  await page.getByLabel("Password", { exact: true }).fill("new-test-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator("#sign-in-status")).toContainText(
    "Complete the CAPTCHA",
  );
  expect(requests).toHaveLength(0);
  await page.evaluate(() => hcaptcha.testSolve("signup-token"));
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator("#sign-in-status")).toContainText(
    "Password must contain a symbol",
  );
  expect(requests[0].gotrue_meta_security.captcha_token).toBe("signup-token");
  await page.evaluate(() => hcaptcha.testSolve("new-signup-token"));
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator("#sign-in-status")).toContainText(
    "Check your email",
  );
  expect(requests[1].gotrue_meta_security.captcha_token).toBe(
    "new-signup-token",
  );
  expect(await page.evaluate(() => hcaptcha.getResponse())).toBe("");
});
