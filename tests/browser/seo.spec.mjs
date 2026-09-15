import { expect, test } from '@playwright/test';

const origin = 'https://www.yorkmodelengineers.co.uk';

test('public metadata and workflow indexing headers are correct', async ({ page, request }) => {
  for (const path of ['/', '/events', '/visitors', '/membership']) {
    const response = await page.goto(path);
    expect(response.headers()['x-robots-tag']).toBeUndefined();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${path === "/" ? "" : path}`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S{3}/);
  }
  for (const path of ['/signin', '/account', '/auth/switch-account', '/events/7/book', '/membership/guardian-consent']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()['x-robots-tag']).toContain('noindex');
  }
  const robots = await request.get('/robots.txt');
  const text = await robots.text();
  expect(text).toContain(`Sitemap: ${origin}/sitemap.xml`);
  expect(text).not.toContain('Disallow: /signin');
});

test('public event pages have matching content, metadata, schema and sitemap entries', async ({ page, request }) => {
  await page.goto('/events');
  const links = page.locator('.events-feature h1 a, .public-event-card h3 a');
  test.skip(!await links.count(), 'No upcoming public events in local data.');
  const href = await links.first().getAttribute('href');
  const name = await links.first().innerText();
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1); // Organisation only on the listing.
  await page.goto(href);
  await expect(page.locator('h1')).toHaveText(name);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${href}`);
  await expect(page).toHaveTitle(`${name} | York Model Engineers`);
  const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
  const event = schemas.map(JSON.parse).find(value => value['@type'] === 'Event');
  expect(event.name).toBe(name);
  expect(event.url).toBe(`${origin}${href}`);
  await expect(page.locator('.public-event-detail-description .event-description')).toHaveText(event.description);
  expect(event.location.address.streetAddress).toContain('North Lane');
  const sitemap = await request.get('/sitemap.xml');
  expect(await sitemap.text()).toContain(`<loc>${origin}${href}</loc>`);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(href);
    await page.evaluate(() => document.fonts.ready);
    if (width < 600) await expect(page.locator("#primary-navigation")).toHaveCSS("visibility", "hidden");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator('.public-event-detail img')).toBeVisible();
    await page.screenshot({ path: `/tmp/ydsme-event-seo-${width}.png` });
  }
  const missing = await request.get('/events/999999999');
  expect(missing.status()).toBe(404);
  const malformed = await request.get('/events/01');
  expect(malformed.status()).toBe(404);
});
