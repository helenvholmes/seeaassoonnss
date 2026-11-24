import { expect, test } from "@playwright/test";

// Multi-part series: the parts menu and the next-part link on a season page, and
// the series field in the editor. Fixtures in src/app/e2e.

test.describe("reading a series", () => {
  test("the corner menu opens on click and lists every part, this one marked", async ({ page }) => {
    await page.goto("e2e/reader-series");
    const menu = page.locator(".series-menu");
    await expect(menu.locator("summary")).toContainText("Odyssey");
    await expect(menu.locator("summary")).toContainText("2/3");
    await expect(menu.locator(".series-menu-parts")).toBeHidden();

    await menu.locator("summary").click();
    const parts = menu.locator(".series-menu-parts li");
    await expect(parts).toHaveCount(3);
    await expect(parts.nth(1).locator("[aria-current=page]")).toHaveText("// Odyssey p 2");
    await expect(menu.getByRole("link", { name: "// Odyssey p 1" })).toHaveAttribute("href", "/seasons/odyssey-p-1");
    await expect(menu.getByRole("link", { name: "// Odyssey p 3" })).toHaveAttribute("href", "/seasons/odyssey-p-3");

    await menu.locator("summary").click();
    await expect(menu.locator(".series-menu-parts")).toBeHidden();
  });

  test("the menu opens from the keyboard and stays in the corner while scrolling", async ({ page }) => {
    await page.goto("e2e/reader-series");
    await page.keyboard.press("Tab");
    await expect(page.locator(".series-menu summary")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".series-menu-parts")).toBeVisible();

    const before = (await page.locator(".series-menu").boundingBox())!;
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    const after = (await page.locator(".series-menu").boundingBox())!;
    expect(after.y).toBeCloseTo(before.y, 0);
  });

  test("the end of the page links to the next part and back to the previous one", async ({ page }) => {
    await page.goto("e2e/reader-series");
    await page.mouse.wheel(0, 5000);
    const next = page.locator(".series-next-link");
    await expect(next).toBeInViewport();
    await expect(next).toContainText("part 3 of 3");
    await expect(next).toHaveAttribute("href", "/seasons/odyssey-p-3");
    await expect(page.locator(".series-previous")).toHaveAttribute("href", "/seasons/odyssey-p-1");
  });
});

test.describe("the series field in the editor", () => {
  test("typing an existing series name joins it as the next part; clearing it leaves", async ({ page }) => {
    await page.goto("e2e/editor-quote");
    await expect(page.locator(".editor-canvas")).toBeVisible();
    const field = page.locator(".editor-inspector .field", { hasText: "Series" }).first();
    const name = field.locator("input[type=text]");
    await name.click();
    await page.keyboard.type("odyssey");

    // Parts 1 and 2 exist, so this season becomes part 3.
    const part = field.locator("input[type=number]");
    await expect(part).toHaveValue("3");
    const members = field.locator(".series-members li");
    await expect(members).toHaveText(["1. Odyssey p 1", "2. Odyssey p 2 (draft)", "3. quote (this season)"]);

    // Taking a part number that is in use warns.
    await part.fill("2");
    await expect(field.locator(".error")).toContainText("“Odyssey p 2” is also part 2.");

    // Undo puts the part back; clearing the name leaves the series.
    await page.locator(".editor-canvas").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+z");
    await expect(part).toHaveValue("3");
    await name.fill("");
    await expect(part).toHaveCount(0);
  });
});
