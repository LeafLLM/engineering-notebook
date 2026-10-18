const { test, expect } = require("@playwright/test");

async function signIn(
  page,
  email = "sam@example.test",
  password = "notebook-test-only",
) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#notebook-account")).not.toContainText("Loading");
}
async function openAccess(page) {
  await expect(page.locator("#refresh-management")).toBeEnabled();
  await page.locator(".team-access summary").click();
  await expect(
    page
      .locator(".team-access")
      .getByRole("button", { name: "Create invite", exact: true }),
  ).toBeEnabled();
}
async function invite(page, email, role = "member") {
  const panel = page.locator(".team-access");
  await panel.getByLabel("Email", { exact: true }).fill(email);
  await panel.getByLabel("Invite access", { exact: true }).selectOption(role);
  await panel
    .getByRole("button", { name: "Create invite", exact: true })
    .click();
  await expect(panel.getByLabel("Invite link", { exact: true })).toBeVisible();
  return panel.getByLabel("Invite link", { exact: true }).inputValue();
}

test("manager invites a new account, joins after signup/reload, changes access and removes membership", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await openAccess(page);
  const link = await invite(page, "invited-new@example.test");
  const context = await browser.newContext();
  const teammate = await context.newPage();
  try {
    await teammate.goto(link);
    await expect(teammate.locator("#sign-in-form")).toContainText(
      "invited email",
    );
    await teammate
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await teammate
      .getByLabel("Email", { exact: true })
      .fill("invited-new@example.test");
    await teammate
      .getByLabel("Password", { exact: true })
      .fill("invited-password");
    await teammate
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      teammate.getByRole("heading", { name: "Join a team" }),
    ).toBeVisible();
    await expect(
      teammate.getByRole("heading", { name: "Create your team" }),
    ).toHaveCount(0);
    await teammate.reload();
    await expect(teammate.locator("#invite-code")).toHaveValue(
      link.split("#invite=")[1],
    );
    await teammate
      .getByLabel("Display name", { exact: true })
      .fill("Invited teammate");
    await teammate.route("**/rpc/accept_team_invite", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary join failure" }),
      }),
    );
    await teammate
      .getByRole("button", { name: "Join team", exact: true })
      .click();
    await expect(
      teammate
        .getByRole("status")
        .filter({ hasText: "Temporary join failure" }),
    ).toBeVisible();
    await teammate.unroute("**/rpc/accept_team_invite");
    await teammate
      .getByRole("button", { name: "Join team", exact: true })
      .click();
    await expect(teammate.locator("#notebook-account")).toHaveText(
      "Invited teammate · Engineering team",
    );
    await expect(teammate.locator(".team-access summary")).toHaveCount(0);
    await expect(teammate.locator('[data-new="task"]')).toBeHidden();

    await page.locator("#refresh-management").click();
    const access = page.getByLabel("Access for Invited teammate", {
      exact: true,
    });
    await expect(access).toHaveValue("member");
    page.once("dialog", (dialog) => dialog.accept());
    await access.selectOption("manager");
    await expect(access).toHaveValue("manager");
    await teammate.reload();
    await expect(teammate.locator(".team-access summary")).toBeVisible();
    await expect(teammate.locator('[data-new="task"]')).toBeVisible();
    await access.selectOption("member");
    await expect(access).toHaveValue("member");
    await teammate.reload();
    await expect(teammate.locator(".team-access summary")).toHaveCount(0);

    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", {
        name: "Remove Invited teammate from team",
        exact: true,
      })
      .click();
    await expect(access).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", {
        name: "Remove Invited teammate from team",
        exact: true,
      })
      .click();
    await expect(access).toHaveCount(0);
    await teammate.reload();
    await expect(
      teammate.getByRole("heading", { name: "Join a team" }),
    ).toBeVisible();
    // Account still exists and the old used invitation cannot silently re-enroll it.
    await teammate.getByLabel("Invitation link or code").fill(link);
    await teammate
      .getByLabel("Display name", { exact: true })
      .fill("Invited teammate");
    await teammate
      .getByRole("button", { name: "Join team", exact: true })
      .click();
    await expect(
      teammate.getByRole("status").filter({ hasText: "already been used" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("manager can revoke links; last-manager demotion/removal and wrong-email joining fail", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await openAccess(page);
  const panel = page.locator(".team-access");
  page.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByLabel("Access for Sam", { exact: true })
    .selectOption("member");
  await expect(panel.getByRole("status")).toContainText("at least one manager");
  await expect(panel.getByLabel("Access for Sam", { exact: true })).toHaveValue(
    "manager",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Remove Sam from team", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("at least one manager");
  const link = await invite(page, "somebody-else@example.test");
  const context = await browser.newContext();
  const newcomer = await context.newPage();
  try {
    await signIn(newcomer, "unassigned@example.test");
    await expect(
      newcomer.getByRole("heading", { name: "Join a team" }),
    ).toBeVisible();
    await newcomer.getByLabel("Invitation link or code").fill(link);
    await newcomer
      .getByLabel("Display name", { exact: true })
      .fill("Wrong email");
    await newcomer
      .getByRole("button", { name: "Join team", exact: true })
      .click();
    await expect(
      newcomer.getByRole("status").filter({ hasText: "invited email" }),
    ).toBeVisible();
    await panel
      .getByRole("button", {
        name: "Revoke invite for somebody-else@example.test",
        exact: true,
      })
      .click();
    await expect(
      panel.getByRole("button", {
        name: "Revoke invite for somebody-else@example.test",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/team-access-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    await context.close();
  }
});
