const { test, expect } = require("@playwright/test");

test("subsystem cards group mixed case names, open entries and preserve archives across sizes", async ({
  page,
  request,
}) => {
  const login = await request.post(
    "/mock-supabase/auth/v1/token?grant_type=password",
    {
      data: { email: "other@example.test", password: "notebook-test-only" },
    },
  );
  const session = await login.json();
  const headers = { Authorization: "Bearer " + session.access_token };
  const roster = await request.get(
    "/mock-supabase/rest/v1/team_members?select=team_id",
    { headers },
  );
  const [{ team_id }] = await roster.json();
  for (const [title, mechanism] of [
    ["Intake design A", "Intake"],
    ["Intake design B", "intake"],
    ["Intake design C", " INTAKE "],
    ["Shooter design", "Shooter"],
  ]) {
    const saved = await request.post("/mock-supabase/rest/v1/documents", {
      headers,
      data: { team_id, title, mechanism },
    });
    expect(saved.ok()).toBe(true);
  }
  await page.goto("/#documenting");
  await page.getByLabel("Email", { exact: true }).fill("other@example.test");
  await page.getByLabel("Password", { exact: true }).fill("notebook-test-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const cards = page.locator("#document-list .document-group");
  await expect(cards).toHaveCount(2);
  const intake = cards.filter({ hasText: "Intake design A" });
  await expect(intake.locator(".document-list-item")).toHaveCount(3);
  await expect(intake.locator(".document-group-count")).toHaveText("3 entries");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const layout = await cards.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    expect(layout[0].height).toBeGreaterThanOrEqual(240);
    if (width === 1440) {
      expect(layout[0].y).toBe(layout[1].y);
      expect(layout[0].x).toBeLessThan(layout[1].x);
      await page.screenshot({
        path: "test-results/document-cards-desktop.png",
        fullPage: true,
      });
    }
    if (width === 320) expect(layout[0].y).toBeLessThan(layout[1].y);
  }
  await page.getByRole("button", { name: /Intake design B/ }).click();
  await expect(page.locator("#entry-title")).toHaveValue("Intake design B");
  await expect(
    page.locator('#document-list [aria-current="true"]'),
  ).toContainText("Intake design B");
  await page
    .getByRole("button", { name: "Archive entry", exact: true })
    .click();
  await expect(cards).toHaveCount(1);
  await expect(cards.locator(".document-list-item")).toHaveCount(1);
  await expect(cards).toContainText("Intake design B");
  await page.locator("#document-archive-filter").selectOption("active");
  await expect(cards).toHaveCount(2);
  await expect(page.locator("#document-list")).not.toContainText(
    "Intake design B",
  );
  await page.locator("#document-archive-filter").selectOption("archived");
  await page.getByRole("button", { name: /Intake design B/ }).click();
  await page
    .getByRole("button", { name: "Restore entry", exact: true })
    .click();
  await expect(cards).toHaveCount(2);
  await expect(
    cards.filter({ hasText: "Intake design A" }).locator(".document-list-item"),
  ).toHaveCount(3);
});
