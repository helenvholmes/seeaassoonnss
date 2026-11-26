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

// The sample season's "frogs, 10 pm" voice note plays a real recording when pressed.
test("the sample voice note plays the frogs recording", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("about");
  const sample = page.locator(".landing-sample").first();
  const note = sample.locator(".voice-note", { hasText: "frogs, 10 pm" });
  await expect(note).toContainText("0:42");
  // Nothing loads until someone presses play.
  const audio = note.locator("audio");
  await expect(audio).toHaveAttribute("preload", "none");

  const response = page.waitForResponse((r) => r.url().endsWith("/landing/media/frogs/audio.mp3"));
  await note.getByRole("button", { name: "Play voice note" }).click();
  expect((await response).ok()).toBe(true);
  await expect(note.getByRole("button", { name: "Pause voice note" })).toBeVisible();
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0);

  await note.getByRole("button", { name: "Pause voice note" }).click();
  await expect(note.getByRole("button", { name: "Play voice note" })).toBeVisible();
  expect(await audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
});
