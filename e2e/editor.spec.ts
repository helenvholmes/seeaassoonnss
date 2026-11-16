import { expect, test, type Locator, type Page } from "@playwright/test";

// The editor, driven like a person would: real mouse, keyboard and scrolling.
// Each test opens a fixture season (src/app/e2e) in the real editor; saving is
// refused there (no sign-in), which these tests do not depend on.

const items = (page: Page) => page.locator(".editor-canvas .item");
const center = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
};
const inspectorText = (page: Page) => page.locator(".editor-inspector").innerText();

async function openEditor(page: Page, fixture: "editor-quote" | "editor-route") {
  await page.goto(`e2e/${fixture}`);
  await expect(page.locator(".editor-canvas")).toBeVisible();
  await expect(items(page).first()).toBeVisible();
}

test.describe("editing items", () => {
  test("Option-drag duplicates an item; undo removes the copy", async ({ page }) => {
    await openEditor(page, "editor-quote");
    const quote = page.locator(".editor-canvas .item.item-quote");
    const start = await center(quote);
    await page.keyboard.down("Alt");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 60, { steps: 6 });
    await page.mouse.move(start.x, start.y + 150, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Alt");

    await expect(items(page)).toHaveCount(2);
    const [a, b] = await Promise.all([items(page).nth(0).boundingBox(), items(page).nth(1).boundingBox()]);
    expect(Math.abs(a!.y - start.box.y)).toBeLessThan(2); // the original stays
    expect(b!.y - start.box.y).toBeGreaterThan(100); // the copy moved

    await page.keyboard.press("ControlOrMeta+z");
    await expect(items(page)).toHaveCount(1);
  });

  test("Option-click without dragging leaves no copy", async ({ page }) => {
    await openEditor(page, "editor-quote");
    const { x, y } = await center(page.locator(".editor-canvas .item.item-quote"));
    await page.keyboard.down("Alt");
    await page.mouse.click(x, y);
    await page.keyboard.up("Alt");
    await expect(items(page)).toHaveCount(1);
  });

  test("clicking inside text being edited moves the cursor there", async ({ page }) => {
    await openEditor(page, "editor-quote");
    const quote = page.locator(".editor-canvas .item.item-quote");
    const { x, y } = await center(quote);
    await page.mouse.dblclick(x, y);
    const editor = page.locator(".inline-quote-editor");
    await expect(editor).toBeFocused();
    // Click just after "A " (the start of the text, away from the resize handles).
    const box = (await editor.boundingBox())!;
    const before = await editor.evaluate((t: HTMLTextAreaElement) => t.selectionStart);
    const lineHeight = await editor.evaluate((t) => parseFloat(getComputedStyle(t).lineHeight) || parseFloat(getComputedStyle(t).fontSize) * 1.2);
    await page.mouse.click(box.x + 40, box.y + lineHeight / 2);
    await expect(editor).toBeFocused();
    const after = await editor.evaluate((t: HTMLTextAreaElement) => t.selectionStart);
    expect(after).toBeLessThan(before);
    await page.keyboard.type("X");
    await expect(editor).not.toHaveValue("A summer of trainsX");
  });

  test("⌘S does not open the browser's save dialog; it says the editor saves on its own", async ({ page }) => {
    await openEditor(page, "editor-quote");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.locator(".save-hint")).toContainText("save automatically");
  });

  test("Preview opens in the same tab", async ({ page, context }) => {
    await openEditor(page, "editor-quote");
    const preview = page.getByRole("link", { name: "Preview" });
    await expect(preview).not.toHaveAttribute("target", "_blank");
    let popup = false;
    context.on("page", () => (popup = true));
    await preview.click();
    await page.waitForURL(/preview|sign-in/);
    expect(popup).toBe(false);
  });
});

test.describe("the editor around the page", () => {
  test("the side panels resize by dragging their edges, and the settings never scroll sideways", async ({ page }) => {
    await openEditor(page, "editor-route");
    await page.locator(".item-route").click({ position: { x: 40, y: 40 } });
    const inspector = page.locator(".editor-inspector");
    const overflow = () => inspector.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    const width = async () => (await inspector.boundingBox())!.width;
    const before = await width();
    const handle = await center(page.locator(".panel-handle-inspector"));
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x - 150, handle.y, { steps: 8 });
    await page.mouse.up();
    expect(await width()).toBeGreaterThan(before + 120);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });

  test("zoom keeps the page centered under the keyboard shortcut and pans with Space-drag", async ({ page }) => {
    await openEditor(page, "editor-quote");
    const canvas = page.locator(".editor-canvas");
    const w0 = (await canvas.boundingBox())!.width;
    await page.keyboard.press("ControlOrMeta+Equal");
    await page.keyboard.press("ControlOrMeta+Equal");
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(w0 * 1.4);

    const stage = page.locator(".editor-stage");
    const scroll = () => stage.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    const [l0, t0] = await scroll();
    const s = await center(stage);
    await page.keyboard.down("Space");
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(s.x - 120, s.y - 80, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    const [l1, t1] = await scroll();
    expect(l1 - l0).toBeGreaterThan(100);
    expect(t1 - t0).toBeGreaterThan(60);

    await page.keyboard.press("ControlOrMeta+0");
    await expect.poll(async () => Math.round((await canvas.boundingBox())!.width)).toBe(Math.round(w0));
  });
});

test.describe("route maps in the editor", () => {
  test("the rotate handle turns the map, not the band", async ({ page }) => {
    await openEditor(page, "editor-route");
    const route = page.locator(".item-route");
    await route.click({ position: { x: 40, y: 40 } });
    const handle = page.locator(".moveable-rotation-control");
    await expect(handle).toBeVisible();
    const h = await center(handle);
    const r = await center(route);
    // Drag the handle a quarter of the way round, clockwise.
    const radius = Math.hypot(h.x - r.x, h.y - r.y);
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    for (let a = 0; a <= 45; a += 5) {
      const t = ((-90 + a) * Math.PI) / 180;
      await page.mouse.move(r.x + radius * Math.cos(t), r.y + radius * Math.sin(t));
    }
    await page.mouse.up();
    await expect.poll(() => inspectorText(page)).toMatch(/Rotate map: -4\d°/);
    expect(await route.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  });

  test("dragging the start mark sets when the line starts drawing; one undo reverts it", async ({ page }) => {
    await openEditor(page, "editor-route");
    const grip = page.locator(".route-scale-grip");
    await expect(grip).toBeVisible();
    const g = await center(grip);
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x, g.y + 80, { steps: 8 });
    await page.mouse.move(g.x, g.y + 160, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => inspectorText(page)).toMatch(/Line starts drawing \d+% of the way/);
    // The route box itself did not move.
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => inspectorText(page)).toContain("Line starts drawing as soon as the map pins");
  });
});

test.describe("route maps on the page", () => {
  test("the line waits for its start, then draws; names appear only once reached", async ({ page }) => {
    await page.goto("e2e/reader-route");
    const line = page.locator(".route-line");
    await expect(line).toHaveAttribute("stroke-dasharray", /\d/);
    const band = page.locator(".route-band");
    const geometry = await band.evaluate((b) => {
      const el = b as HTMLElement;
      const panel = el.querySelector(".route-panel") as HTMLElement;
      return { top: el.getBoundingClientRect().top + window.scrollY, travel: el.offsetHeight - panel.offsetHeight };
    });
    const drawnAt = async (f: number) => {
      await page.evaluate((y) => window.scrollTo(0, y), geometry.top + geometry.travel * f);
      await page.waitForTimeout(250);
      return line.evaluate((l) => 1 - parseFloat(l.getAttribute("stroke-dashoffset")!) / parseFloat(l.getAttribute("stroke-dasharray")!));
    };
    const reached = () => page.locator(".route-place.reached").evaluateAll((els) => els.map((e) => e.textContent));

    expect(await drawnAt(0.3)).toBeLessThan(0.01); // drawStart is 0.4
    expect(await reached()).toEqual(["Lisbon"]);
    expect(await drawnAt(0.7)).toBeCloseTo(0.5, 1);
    expect(await drawnAt(1)).toBeGreaterThan(0.99);
    expect(await reached()).toEqual(["Lisbon", "Madrid", "Barcelona"]);
  });
});
