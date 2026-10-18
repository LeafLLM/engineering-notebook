const { test, expect } = require("@playwright/test");

test("demo supports local tasks, documents and resources without backend requests", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Try demo", exact: true }),
  ).toBeVisible();
  const backendRequests = [];
  page.on("request", (request) => {
    if (/supabase\.co|\/rest\/v1|\/auth\/v1/.test(request.url()))
      backendRequests.push(request.url());
  });
  await page.getByRole("link", { name: "Try demo", exact: true }).click();
  await expect(page).toHaveURL(/\?demo=1#overview$/);
  await expect(
    page.getByText("Demo · changes reset on refresh", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#team-roster")).toContainText("Jordan");
  await expect(page.locator(".team-access")).toHaveCount(0);
  await expect(page.locator("#task-table-body")).toContainText(
    "Test intake roller spacing",
  );
  await page.locator('[data-new="task"]').click();
  await page.locator("#item-title").fill("Demo-only task");
  await page.locator("#item-assignee").selectOption({ label: "Jordan" });
  await page.locator("#save-item").click();
  await expect(page.locator("#task-table-body")).toContainText(
    "Demo-only task",
  );

  await page.locator('.navbar a[href="#documenting"]').click();
  await page.getByRole("button", { name: /Intake roller test/ }).click();
  await expect(page.locator("#editor .ql-editor")).toContainText(
    "roller spacings",
  );
  await page.locator("#new-document").click();
  await page.locator("#entry-title").fill("Demo-only entry");
  await page.locator("#mechanism-title").fill("Intake");
  await page.locator("#editor .ql-editor").fill("Testing the demo editor.");
  await page.locator("#save-document").click();
  await expect(page.locator("#save-document")).toHaveText("Save now");

  await page.locator('.navbar a[href="#resources"]').click();
  await expect(
    page.getByText("Pre-test checklist", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.locator('.navbar a[href="#documenting"]').click();
  await expect(
    page.getByRole("button", { name: /Intake roller test/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Demo-only entry/ }),
  ).toHaveCount(0);
  await page.locator('.navbar a[href="#overview"]').click();
  await expect(page.locator("#task-table-body")).not.toContainText(
    "Demo-only task",
  );
  expect(backendRequests).toEqual([]);
  await page.getByRole("button", { name: "Exit demo", exact: true }).click();
  await expect(page).not.toHaveURL(/demo=1/);
  await expect(page.locator("#sign-in-form")).toBeVisible();
});

test("demo keeps an existing real session intact and fits phone widths", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("sam@example.test");
  await page.getByLabel("Password", { exact: true }).fill("notebook-test-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#notebook-account")).toHaveText(
    "Sam · Engineering team",
  );
  await page.goto("/?demo=1");
  await expect(page.locator("#team-roster")).toContainText("Alex");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  // An unsaved demo draft must not trap visitors behind a beforeunload prompt.
  await page.locator('.navbar a[href="#documenting"]').click();
  await page.locator("#new-document").click();
  await page.locator("#entry-title").fill("Unsaved demo draft");
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Exit demo", exact: true }).click();
  await expect(page.locator("#notebook-account")).toHaveText(
    "Sam · Engineering team",
  );
  expect(dialogs).toEqual([]);
});
