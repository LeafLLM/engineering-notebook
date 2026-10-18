const { test, expect } = require("@playwright/test");

async function login(page, email = "sam@example.test") {
  await page.goto("/");
  await page.locator("#account-email").fill(email);
  await page.locator("#account-password").fill("notebook-test-only");
  await page.locator("#sign-in-button").click();
  await expect(page.locator("#notebook-workspace")).not.toHaveAttribute(
    "hidden",
  );
  await expect(page.locator("#refresh-management")).toBeEnabled();
}
async function createEntry(page, title) {
  await page.locator('a[href="#documenting"]').first().click();
  await page.locator("#entry-title").fill(title);
  await page.locator("#mechanism-title").fill("Intake");
  await page
    .getByRole("textbox", { name: "Document content", exact: true })
    .fill("First design notes");
  await page.locator("#save-document").click();
  await expect(page.locator("#document-status")).toContainText(
    "Saved to team notebook",
  );
}

test("React notebook preserves create, autosave, reopen, templates, archive and navigation", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await createEntry(page, "React persistence");
  await page.locator("#entry-title").fill("React persistence updated");
  await expect(page.locator("#document-status")).toContainText(
    "Saved to team notebook",
  );
  await page.reload();
  await expect(page.locator("#entry-title")).toHaveValue(
    "React persistence updated",
  );
  await expect(
    page.getByRole("textbox", { name: "Document content", exact: true }),
  ).toContainText("First design notes");
  await page.locator("#insert-template").click();
  await expect(page.locator("#editor")).toContainText("Problem");
  await expect(page.locator("#editor")).toContainText("First design notes");
  await expect(page.locator("#document-status")).toContainText(
    "Saved to team notebook",
  );
  await page.locator("#archive-document").click();
  await expect(page.locator("#document-status")).toContainText(
    "Archived entry",
  );
  await expect(page.locator("#entry-title")).toHaveAttribute("readonly");
  await page.locator("#archive-document").click();
  await expect(page.locator("#entry-title")).not.toHaveAttribute("readonly");
  await page.locator('a[href="#overview"]').first().click();
  await expect(page.locator("#overview")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#documenting")).toBeVisible();
  expect(errors).toEqual([]);
});

test("typing during a slow save is saved; failed saves keep the draft", async ({
  page,
  request,
}) => {
  await login(page);
  await createEntry(page, "Slow save");
  await request.post("/test/delay-next-save");
  await page.locator("#entry-title").fill("During request");
  await expect(page.locator("#document-status")).toHaveText("Saving…");
  await page.locator("#entry-title").fill("Newest typing");
  await expect(page.locator("#document-status")).toContainText(
    "Saved to team notebook",
  );
  await page.reload();
  await expect(page.locator("#entry-title")).toHaveValue("Newest typing");
  await request.post("/test/fail-next-save");
  await page.locator("#entry-title").fill("Keep failed draft");
  await expect(page.locator("#document-status")).toContainText("Save failed");
  await expect(page.locator("#entry-title")).toHaveValue("Keep failed draft");
  await page.locator("#save-document").click();
  await expect(page.locator("#document-status")).toContainText(
    "Saved to team notebook",
  );
});

test("two editors detect a stale revision and can recover the draft as a copy", async ({
  page,
  browser,
}) => {
  await login(page);
  await createEntry(page, "Conflict source");
  const id = await page
    .locator('#document-list [aria-current="true"]')
    .getAttribute("data-document-id");
  const context = await browser.newContext();
  const teammate = await context.newPage();
  try {
    await login(teammate, "taylor@example.test");
    await teammate.locator('a[href="#documenting"]').first().click();
    await teammate.locator(`[data-document-id="${id}"]`).click();
    await expect(teammate.locator("#entry-title")).toHaveValue(
      "Conflict source",
    );
    await page.locator("#entry-title").fill("Teammate saved first");
    await expect(page.locator("#document-status")).toContainText(
      "Saved to team notebook",
    );
    await teammate.locator("#entry-title").fill("My preserved draft");
    await expect(teammate.locator("#document-conflict-actions")).toBeVisible();
    await expect(teammate.locator("#entry-title")).toHaveValue(
      "My preserved draft",
    );
    await teammate.locator("#copy-document").click();
    await expect(teammate.locator("#document-status")).toContainText(
      "Saved to team notebook",
    );
    await expect(teammate.locator("#entry-title")).toHaveValue(
      "My preserved draft (copy)",
    );
  } finally {
    await context.close();
  }
});

test("tasks, calendar, resources, role controls and sign-out work in React", async ({
  page,
}) => {
  await login(page);
  const add = page.locator('[data-new="task"]');
  await expect(add).toBeEnabled();
  await add.click();
  await page.locator("#item-title").fill("Test intake");
  await page
    .locator("#item-assignee")
    .selectOption("10000000-0000-4000-8000-000000000002");
  const today = new Date();
  const day = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  await page.locator("#item-due").fill(day);
  await page.locator("#save-item").click();
  await expect(page.locator("#task-table-body")).toContainText("Test intake");
  await page.locator(".calendar-day.today").click();
  await expect(page.locator("#clear-calendar-day")).toBeVisible();
  await expect(page.locator("#task-table-body")).toContainText("Test intake");
  await page.locator('a[href="#resources"]').click();
  await page.locator('[data-new="resource"]').click();
  await page.locator("#item-title").fill("Bearing reference");
  await page.locator("#item-url").fill("https://example.com/bearing");
  await page.locator("#save-item").click();
  await expect(page.locator("#resource-grid")).toContainText(
    "Bearing reference",
  );
  await page.locator("#resource-search").fill("no match");
  await expect(page.locator("#resource-empty")).toBeVisible();
  await page.locator("#resource-search").fill("");
  await page
    .getByRole("button", { name: "Edit Bearing reference", exact: true })
    .click();
  await page.locator("#archive-item").click();
  await page.locator("#resource-category").selectOption("archived");
  await expect(page.locator("#resource-grid")).toContainText(
    "Bearing reference",
  );
  await page.locator("#sign-out").click();
  await expect(page.locator("#sign-in-form")).toBeVisible();
  await login(page, "taylor@example.test");
  await expect(page.locator('[data-new="task"]')).toBeHidden();
  await page.locator('a[href="#overview"]').first().click();
  await page
    .getByRole("button", { name: "Edit Test intake", exact: true })
    .click();
  await expect(page.locator("#task-assignment-field")).toBeHidden();
  await page.locator("#item-status").selectOption("Done");
  await page.locator("#save-item").click();
  await expect(page.locator("#task-table-body")).not.toContainText(
    "Test intake",
  );
});

test("responsive navigation and layout remain usable", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ["overview", "documenting", "resources"]) {
      await page.locator(`.navbar a[href="#${tab}"]`).click();
      await expect(page.locator("#" + tab)).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      if (width === 1440 || width === 390) {
        await page.screenshot({
          path: `test-results/polish-${tab}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
  await page.screenshot({
    path: "test-results/react-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
