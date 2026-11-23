import { expect, test } from "@playwright/test";

// The 404 page. An unknown fixture name calls notFound() without touching the
// database, so this runs on a machine with no database set up.
test("an unknown address shows the not-found page with a way back", async ({ page }) => {
  const res = await page.goto("e2e/no-such-season");
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle(/not here/);
  await expect(page.getByRole("heading", { name: "// not here" })).toBeVisible();
  const back = page.getByRole("link", { name: /See all seasons/ });
  await expect(back).toHaveAttribute("href", "/seasons");
  await expect(page.locator(".not-found-sticker")).toHaveJSProperty("complete", true);
  expect(await page.locator(".not-found-sticker").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});
