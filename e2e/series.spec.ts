import { expect, test } from "@playwright/test";

// Multi-part series: the parts menu and the previous/next links on a season page, and
// the series field in the editor. Fixtures in src/app/e2e.

test.describe("reading a series", () => {
  test("the upper-right menu shows the part count, opens on click and lists every part, this one marked", async ({ page }) => {
    await page.goto("e2e/reader-series");
    const menu = page.locator(".series-menu");
    // Just the count, in the upper right corner; the series name is in the list's links.
    await expect(menu.locator("summary")).toHaveText("2/3");
    const box = (await menu.boundingBox())!;
    expect(box.y).toBeLessThan(24);
    expect(box.x + box.width).toBeGreaterThan(page.viewportSize()!.width - 24);
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

  test("the bottom of the page has the previous part on the left and the next on the right", async ({ page }) => {
    await page.goto("e2e/reader-series");
    await page.mouse.wheel(0, 5000);
    const previous = page.locator(".series-previous");
    const next = page.locator(".series-next-link");
    await expect(previous).toBeInViewport();
    await expect(next).toBeInViewport();
    await expect(previous).toHaveText("← Odyssey p 1");
    await expect(previous).toHaveCSS("font-style", "italic");
    await expect(previous).toHaveAttribute("href", "/seasons/odyssey-p-1");
    await expect(next).toHaveText("Odyssey p 3 →");
    await expect(next).toHaveAttribute("href", "/seasons/odyssey-p-3");
    await expect(next).toHaveAccessibleName("Next: Odyssey p 3, part 3 of 3");

    // Inset from the edges, not hard against them.
    const width = page.viewportSize()!.width;
    const p = (await previous.boundingBox())!;
    const n = (await next.boundingBox())!;
    expect(p.x).toBeLessThan(width / 4);
    expect(p.x).toBeGreaterThan(64);
    expect(n.x + n.width).toBeGreaterThan((width * 3) / 4);
    expect(n.x + n.width).toBeLessThan(width - 64);
    expect(Math.abs(p.y - n.y)).toBeLessThan(2);
  });

  test("the first part links only forward, on the right; the last only back, on the left", async ({ page }) => {
    const width = page.viewportSize()!.width;

    await page.goto("e2e/reader-series-first");
    await page.mouse.wheel(0, 5000);
    await expect(page.locator(".series-previous")).toHaveCount(0);
    const next = page.locator(".series-next-link");
    await expect(next).toBeInViewport();
    await expect(next).toHaveAttribute("href", "/seasons/odyssey-p-2");
    const n = (await next.boundingBox())!;
    expect(n.x + n.width).toBeGreaterThan((width * 3) / 4);

    await page.goto("e2e/reader-series-last");
    await page.mouse.wheel(0, 5000);
    await expect(page.locator(".series-next-link")).toHaveCount(0);
    const previous = page.locator(".series-previous");
    await expect(previous).toBeInViewport();
    await expect(previous).toHaveAttribute("href", "/seasons/odyssey-p-2");
    expect((await previous.boundingBox())!.x).toBeLessThan(width / 4);
  });

  test("clicking the next part goes there", async ({ page }) => {
    await page.goto("e2e/reader-series");
    await page.mouse.wheel(0, 5000);
    const next = page.locator(".series-next-link");
    await expect(next).toBeInViewport();
    await next.click();
    await expect(page).toHaveURL(/\/odyssey-p-3$/);
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
