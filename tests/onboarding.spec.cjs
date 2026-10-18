const { test, expect } = require("@playwright/test");

async function openSignup(page, email) {
  await page.goto("/");
  await expect(page.locator("#sign-in-status")).toContainText(
    "Sign in or create",
  );
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("new-test-password");
}

test("signup, team creation, duplicate name recovery, manager access and reload", async ({
  page,
}) => {
  await openSignup(page, "new-manager@example.test");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create your team" }),
  ).toBeVisible();
  await expect(page.locator("#notebook-notice")).toBeHidden();
  await page.getByLabel("Your name", { exact: true }).fill("Alex");
  await page.getByLabel("Team name", { exact: true }).fill("engineering TEAM");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "already in use" }),
  ).toBeVisible();
  await page
    .getByLabel("Team name", { exact: true })
    .fill("Signup robotics team");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(page.locator("#notebook-account")).toHaveText(
    "Alex · Signup robotics team",
  );
  await expect(
    page.getByRole("heading", { name: "Create your team" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add task/ })).toBeEnabled();
  await page.reload();
  await expect(page.locator("#notebook-account")).toHaveText(
    "Alex · Signup robotics team",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator("#sign-in-form")).toBeVisible();
  await page
    .getByLabel("Email", { exact: true })
    .fill("new-manager@example.test");
  await page.getByLabel("Password", { exact: true }).fill("new-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#notebook-account")).toHaveText(
    "Alex · Signup robotics team",
  );
});

test("confirmation signup stays signed out and signup errors can be retried", async ({
  page,
}) => {
  await openSignup(page, "confirm@example.test");
  await page.route("**/auth/v1/signup", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ msg: "Signup temporarily unavailable" }),
    }),
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator("#sign-in-status")).toContainText(
    "Signup temporarily unavailable",
  );
  await page.unroute("**/auth/v1/signup");
  await page.route("**/auth/v1/signup", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "10000000-0000-4000-8000-000000000099",
        email: "confirm@example.test",
        identities: [],
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator("#sign-in-status")).toContainText(
    "Check your email",
  );
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: "Create your team" }),
  ).toHaveCount(0);
});

test("existing account without membership sees team setup and can sign out", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByLabel("Email", { exact: true })
    .fill("unassigned@example.test");
  await page.getByLabel("Password", { exact: true }).fill("notebook-test-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create your team" }),
  ).toBeVisible();
  await expect(page.locator("#notebook-notice")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/team-setup-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create your team" }),
  ).toHaveCount(0);
  await expect(page.locator("#sign-in-form")).toBeVisible();
});
