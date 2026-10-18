const { test, expect } = require("@playwright/test");

test.use({
  viewport: { width: 390, height: 664 },
  isMobile: true,
  hasTouch: true,
});

async function expectCurrentSection(page, id) {
  await expect(page.locator(`.navbar a[href="#${id}"]`)).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page).toHaveURL(new RegExp("#" + id + "$"));
  await expect
    .poll(async () => {
      return page.locator("#" + id).evaluate((node) => {
        const section = node.getBoundingClientRect();
        const nav = document.querySelector(".navbar").getBoundingClientRect();
        return (
          section.top >= nav.bottom - 1 &&
          section.top < innerHeight &&
          section.bottom > nav.bottom
        );
      });
    })
    .toBe(true);
}

test("phone taps reveal selected content instead of returning to the sign-in form", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#sign-in-form")).toBeVisible();
  for (const id of ["resources", "documenting", "overview"]) {
    await page.locator(`.navbar a[href="#${id}"]`).tap();
    await expectCurrentSection(page, id);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // Tapping the already-selected tab must also return to its content.
  await page.locator('.navbar a[href="#overview"]').tap();
  await expectCurrentSection(page, "overview");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 664 });
    const boxes = await page.locator(".navbar a").evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
    expect(boxes.every((box) => box.width >= 90 && box.height >= 44)).toBe(
      true,
    );
  }
});

test("signed-in touch navigation preserves drafts and supports Back and Forward", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("sam@example.test");
  await page.getByLabel("Password", { exact: true }).fill("notebook-test-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).tap();
  await expect(page.locator("#notebook-workspace")).not.toHaveAttribute(
    "hidden",
  );
  await page.locator('.navbar a[href="#documenting"]').tap();
  await expectCurrentSection(page, "documenting");
  await page.locator("#new-document").tap();
  await page.locator("#entry-title").fill("Mobile unsaved draft");
  await page.locator('.navbar a[href="#resources"]').tap();
  await expectCurrentSection(page, "resources");
  await page.locator('.navbar a[href="#documenting"]').tap();
  await expectCurrentSection(page, "documenting");
  await expect(page.locator("#entry-title")).toHaveValue(
    "Mobile unsaved draft",
  );
  await page.goBack();
  await expectCurrentSection(page, "resources");
  await page.goForward();
  await expectCurrentSection(page, "documenting");
  await expect(page.locator("#entry-title")).toHaveValue(
    "Mobile unsaved draft",
  );
  await page.screenshot({
    path: "test-results/mobile-tabs-after.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
