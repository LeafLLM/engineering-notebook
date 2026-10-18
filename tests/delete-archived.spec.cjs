const { test, expect } = require("@playwright/test");

async function login(page) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("sam@example.test");
  await page.getByLabel("Password", { exact: true }).fill("notebook-test-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#refresh-management")).toBeEnabled();
}

test("entry deletion supports cancellation, failure recovery and persistent removal", async ({
  page,
}) => {
  await login(page);
  await page.locator('.navbar a[href="#documenting"]').click();
  await page.locator("#entry-title").fill("Delete this archived entry");
  await page.locator("#save-document").click();
  await expect(page.locator("#document-status")).toContainText(
    "Saved to team notebook",
  );
  await expect(page.locator("#delete-document")).toHaveCount(0);
  await page.locator("#archive-document").click();
  await expect(page.locator("#delete-document")).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#delete-document").click();
  await expect(page.locator("#entry-title")).toHaveValue(
    "Delete this archived entry",
  );
  await page.route("**/rest/v1/documents?**", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Temporary delete failure" }),
        })
      : route.continue(),
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-document").click();
  await expect(page.locator("#notebook-error")).toContainText(
    "Temporary delete failure",
  );
  await expect(page.locator("#entry-title")).toHaveValue(
    "Delete this archived entry",
  );
  await page.unroute("**/rest/v1/documents?**");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-document").click();
  await expect(page.locator("#document-status")).toHaveText(
    "Archived entry deleted.",
  );
  await expect(page.locator("#notebook-notice")).toBeHidden();
  await expect(page.locator("#document-list")).not.toContainText(
    "Delete this archived entry",
  );
  await page.reload();
  await page.locator("#document-archive-filter").selectOption("archived");
  await expect(page.locator("#document-list")).not.toContainText(
    "Delete this archived entry",
  );
});

test("archived resources and tasks can be permanently deleted", async ({
  page,
}) => {
  await login(page);
  await page.locator('.navbar a[href="#resources"]').click();
  await page.locator('[data-new="resource"]').click();
  await page.locator("#item-title").fill("Disposable archived resource");
  await expect(page.locator("#delete-item")).toHaveCount(0);
  await page.locator("#save-item").click();
  await page
    .getByRole("button", {
      name: "Edit Disposable archived resource",
      exact: true,
    })
    .click();
  await page.locator("#archive-item").click();
  await page.locator("#resource-category").selectOption("archived");
  await page
    .getByRole("button", {
      name: "Edit Disposable archived resource",
      exact: true,
    })
    .click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#delete-item").click();
  await expect(page.locator("#item-dialog")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page
      .locator("#item-dialog")
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/delete-archived-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-item").click();
  await expect(page.locator("#item-dialog")).toHaveCount(0);
  await expect(page.locator("#resource-grid")).not.toContainText(
    "Disposable archived resource",
  );

  await page.locator('.navbar a[href="#overview"]').click();
  await page.locator('[data-new="task"]').click();
  await page.locator("#item-title").fill("Disposable archived task");
  await page.locator("#save-item").click();
  await page
    .getByRole("button", { name: "Edit Disposable archived task", exact: true })
    .click();
  await page.locator("#archive-item").click();
  await page.locator("#task-status-filter").selectOption("archived");
  await page
    .getByRole("button", { name: "Edit Disposable archived task", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-item").click();
  await expect(page.locator("#item-dialog")).toHaveCount(0);
  await page.reload();
  await page.locator("#task-status-filter").selectOption("archived");
  await expect(page.locator("#task-table-body")).not.toContainText(
    "Disposable archived task",
  );
  await page.locator('.navbar a[href="#resources"]').click();
  await page.locator("#resource-category").selectOption("archived");
  await expect(page.locator("#resource-grid")).not.toContainText(
    "Disposable archived resource",
  );
});
