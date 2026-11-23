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

// On seeaassoonnss.app, vercel.json rewrites addresses outside /seasons (like /login)
// to this route, so they get the same page instead of Vercel's plain 404.
test("the rewrite target for addresses outside /seasons is the not-found page", async ({ page }) => {
  const res = await page.goto("404");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "// not here" })).toBeVisible();
});

// /login and /signin are the addresses people guess for signing in; they go to the sign-in page.
test("/login and /signin (also under /seasons) redirect to the sign-in page", async ({ request }) => {
  for (const path of ["/login", "/seasons/login", "/signin", "/seasons/signin"]) {
    const res = await request.get(`http://localhost:3100${path}`, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(res.headers()["location"], path).toBe("/seasons/edit/sign-in");
  }
});
