import { expect, test } from "@playwright/test";

test("public events show uncropped artwork and useful details at desktop and phone widths", async ({ page }) => {
  for (const width of [1440, 800, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/events");
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (await page.locator(".events-feature").count()) {
      const image = page.locator(".events-feature img");
      await expect(image).toBeVisible();
      await expect(image).toHaveCSS("object-fit", "contain");
      await expect(page.locator(".public-event-facts")).toContainText("UK local time");
      await expect(page.locator(".events-about .event-description")).toHaveCSS("white-space", "pre-wrap");
      const artwork = await page.locator(".events-feature .public-event-artwork").boundingBox();
      const copy = await page.locator(".events-feature-copy").boundingBox();
      if (width <= 900) expect(copy.y).toBeGreaterThanOrEqual(artwork.y + artwork.height);
      else expect(copy.x).toBeGreaterThan(artwork.x);
      await expect(page.locator(".public-event-actions .button").first()).toBeVisible();
      const buttons = page.locator(".public-event-actions .button");
      await expect(buttons).toHaveCount(2);
      const primary = await buttons.nth(0).boundingBox();
      const secondary = await buttons.nth(1).boundingBox();
      expect(primary.height).toBeGreaterThanOrEqual(50);
      expect(secondary.height).toBeCloseTo(primary.height, 0);
      if (width <= 560) expect(secondary.y).toBeGreaterThanOrEqual(primary.y + primary.height);
      if (width <= 900) expect((await page.locator(".events-feature").boundingBox()).height).toBeGreaterThanOrEqual(1000);
      await expect(page.locator(".events-feature a", { hasText: "Get directions" })).toHaveAttribute("href", /53\.94183%2C-1\.11166/);
    } else {
      await expect(page.locator(".inner-hero")).toBeVisible();
      await expect(page.locator(".events-empty")).toContainText("no upcoming public events");
    }
    await expect(page.locator(".events-carousel-controls")).toHaveCount(0);
  }
});

test("unavailable event artwork falls back to the standard railway image", async ({ page }) => {
  await page.route(/\/_next\/image\?/, route => {
    const image = new URL(route.request().url()).searchParams.get("url") || "";
    return image.includes("/storage/") ? route.abort() : route.continue();
  });
  await page.goto("/events");
  test.skip(!await page.locator(".events-feature").count(), "No public event is currently listed.");
  const image = page.locator(".events-feature img");
  await expect(image).toHaveAttribute("src", /events\.webp/, { timeout: 15000 });
  await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0), { timeout: 15000 }).toBe(true);
});

test("upcoming public events stay limited and booking follows expanded details", async ({ page }) => {
  await page.goto("/events");
  const cards = page.locator(".public-event-card");
  expect(await cards.count()).toBeLessThanOrEqual(4);
  await expect(page.locator(".upcoming-events-pagination")).toHaveCount(0);
  await expect(page.locator('.public-event-list a[href="/visitors"]')).toHaveCount(0);
  for (const card of await cards.all()) {
    await expect(card.locator(".public-event-audience")).toHaveText("Open to everyone");
  }
  const booked = cards.filter({ has: page.locator('a[href$="/book"]') });
  if (await booked.count()) {
    const card = booked.first();
    await card.getByRole("button", { name: /View details/ }).click();
    const description = card.locator(".public-event-expanded-description");
    await expect(description).toBeVisible();
    const textBox = await description.boundingBox();
    const buttonBox = await card.locator('a[href$="/book"]').boundingBox();
    expect(buttonBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height);
    await card.getByRole("button", { name: /Hide details/ }).click();
    await expect(description).toBeHidden();
  }
});
