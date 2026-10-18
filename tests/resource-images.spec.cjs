const { test, expect } = require("@playwright/test");

const picture = (name = "part.png") => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
});

async function openResources(page) {
  await page.goto("/");
  await page.locator("#account-email").fill("sam@example.test");
  await page.locator("#account-password").fill("notebook-test-only");
  await page.locator("#sign-in-button").click();
  await expect(page.locator("#refresh-management")).toBeEnabled();
  await page.locator('.navbar a[href="#resources"]').click();
  await page.locator('[data-new="resource"]').click();
}

test("resource pictures survive failed saves, reloads, edits and removal", async ({
  page,
  request,
}) => {
  await openResources(page);
  await page.locator("#item-title").fill("Pictured assembly");
  await page
    .locator("#resource-images")
    .setInputFiles([picture(), picture("detail.png")]);
  await expect(page.locator(".resource-image-preview img")).toHaveCount(2);
  await request.post("/test/fail-next-save");
  await page.locator("#save-item").click();
  await expect(page.locator("#item-error")).toContainText(
    "Temporary test save failure",
  );
  await expect(page.locator(".resource-image-preview img")).toHaveCount(2);
  await page.locator("#save-item").click();
  const card = page.locator(".resource-card").filter({
    has: page.getByRole("heading", {
      name: "Pictured assembly",
      exact: true,
    }),
  });
  await expect(card.locator("img")).toHaveCount(2);
  await page.reload();
  await expect(card.locator("img")).toHaveCount(2);
  expect(
    await card
      .locator("img")
      .evaluateAll((images) =>
        images.every((image) => image.complete && image.naturalWidth > 0),
      ),
  ).toBe(true);
  const expand = card.getByRole("button", {
    name: "Expand Pictured assembly",
    exact: true,
  });
  await expand.click();
  const details = page.getByRole("dialog", {
    name: "Pictured assembly",
    exact: true,
  });
  await expect(details).toBeVisible();
  await expect(details.locator("img")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await expect(expand).toBeFocused();
  expect(
    await page
      .locator(".resource-card")
      .evaluateAll(
        (cards) =>
          new Set(cards.map((card) => card.getBoundingClientRect().height))
            .size,
      ),
  ).toBe(1);
  await card
    .getByRole("button", { name: "Edit Pictured assembly", exact: true })
    .click();
  await page
    .locator("#item-notes")
    .fill("Keep both pictures when changing notes.");
  await page.locator("#save-item").click();
  await expect(card.locator("img")).toHaveCount(2);
  await card
    .getByRole("button", { name: "Edit Pictured assembly", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove picture 1", exact: true })
    .click();
  await page.locator("#save-item").click();
  await expect(card.locator("img")).toHaveCount(1);
  await expect(card.locator("img")).toHaveAttribute("alt", "detail.png");
  await page.setViewportSize({ width: 320, height: 800 });
  await expand.click();
  await expect(details).toBeVisible();
  await expect(details.locator("img")).toHaveAttribute("alt", "detail.png");
  expect(
    await details.evaluate(
      (dialog) => dialog.scrollWidth <= dialog.clientWidth + 1,
    ),
  ).toBe(true);
  await details
    .getByRole("button", { name: "Close resource", exact: true })
    .click();
  await expect(details).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await card
    .getByRole("button", { name: "Edit Pictured assembly", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove picture 1", exact: true })
    .click();
  await page.locator("#save-item").click();
  await page.reload();
  await expect(card).toBeVisible();
  await expect(card.locator("img")).toHaveCount(0);
});

test("invalid and oversized pictures are rejected without losing the draft", async ({
  page,
}) => {
  await openResources(page);
  await page.locator("#item-title").fill("Picture validation");
  await page.locator("#resource-images").setInputFiles(picture());
  await expect(page.locator(".resource-image-preview img")).toHaveCount(1);
  await page.locator("#resource-images").setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(page.locator("#item-error")).toContainText(
    "Choose PNG, JPG, or WebP",
  );
  await page.locator("#resource-images").setInputFiles({
    name: "big.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(1024 * 1024 + 1),
  });
  await expect(page.locator("#item-error")).toContainText(
    "no larger than 1 MB",
  );
  await page
    .locator("#resource-images")
    .setInputFiles(Array.from({ length: 5 }, (_, i) => picture(`${i}.png`)));
  await expect(page.locator("#item-error")).toContainText("up to 5 pictures");
  await expect(page.locator(".resource-image-preview img")).toHaveCount(1);
  await expect(page.locator("#item-title")).toHaveValue("Picture validation");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#cancel-item").click();
  await expect(page.locator("#item-dialog")).toHaveCount(0);
});
