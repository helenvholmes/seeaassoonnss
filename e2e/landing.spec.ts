import { expect, test } from "@playwright/test";

// The landing page has a log in button in its upper right corner that goes to the sign-in page.
test("the landing page's log in button sits top right and opens the sign-in page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("about");
  const login = page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "log in" });
  await expect(login).toBeVisible();
  const box = (await login.boundingBox())!;
  expect(box.y).toBeLessThan(80);
  expect(box.x + box.width).toBeGreaterThan(1280 - 80);

  // On a phone it stays in the corner without pushing the page sideways.
  await page.setViewportSize({ width: 375, height: 812 });
  const small = (await login.boundingBox())!;
  expect(small.x + small.width).toBeLessThanOrEqual(375);
  expect(small.x + small.width).toBeGreaterThan(375 - 40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await login.click();
  await expect(page).toHaveURL(/\/seasons\/edit\/sign-in$/);
});
