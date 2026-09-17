import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/events", "/news", "/membership", "/membership/apply", "/signin"];

for (const route of publicRoutes) {
  test(`${route} renders without a server error`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response, `${route} did not return an HTTP response`).not.toBeNull();
    expect(response.status(), `${route} returned ${response.status()}`).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });
}

test("the member sign-in journey is visible", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByText("Member login", { exact: true })).toBeVisible();
});

test("the membership application fits common browser widths", async ({ page }) => {
  for (const width of [1440, 1100, 900, 760, 430, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/membership/apply");
    await expect(page.getByRole("heading", { name: "We’ll find the right plan." })).toBeVisible();
    await expect(page.getByLabel("Date of birth")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `Application overflowed at ${width}px`).toBeLessThanOrEqual(1);
    const continueButton = await page.getByRole("button", { name: "Continue" }).boundingBox();
    expect(continueButton?.height ?? 0, `Continue target was too short at ${width}px`).toBeGreaterThanOrEqual(44);
    if (width <= 900) {
      await expect(page.locator(".membership-apply-steps")).toBeHidden();
      const application = await page.locator(".membership-application-card").boundingBox();
      const help = await page.locator(".membership-apply-help").boundingBox();
      expect(help?.y ?? 0, `Membership help appeared before the form at ${width}px`).toBeGreaterThan(application?.y ?? 0);
    }
  }
});

test("public pages share the same wide-screen content boundary", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  for (const route of ["/membership", "/visitors", "/events", "/news", "/club-history", "/committees", "/projects"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const section = page.locator(route === "/committees" ? 'section[aria-labelledby="committee-heading"]' : ".section").first();
    await expect(section, `${route} has no standard public section`).toBeVisible();
    const contentWidth = await section.evaluate((element) => {
      const styles = getComputedStyle(element);
      return element.getBoundingClientRect().width - Number.parseFloat(styles.paddingLeft) - Number.parseFloat(styles.paddingRight);
    });
    expect(contentWidth, `${route} did not use the shared public width cap`).toBeCloseTo(route === "/committees" ? 1160 : 1344, 0);
  }
});

test("every membership application stage remains usable on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/membership/apply");
  const form = page.locator("form.membership-application-form");
  const expectNoOverflow = async (stage) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${stage} overflowed`).toBeLessThanOrEqual(1);
  };

  await form.locator('input[name="date_of_birth"]').fill("2010-01-01");
  await expect(form.getByRole("group", { name: "Guardian details and consent" })).toBeVisible();
  await expectNoOverflow("Membership stage");
  await form.locator('input[name="guardian_name"]').fill("Preview Guardian");
  await form.locator('input[name="guardian_email"]').fill("guardian@example.test");
  await form.locator('input[name="guardian_consent"]').check();
  await form.getByRole("button", { name: "Continue" }).click();

  await form.locator('input[name="full_name"]').fill("Preview Junior");
  await form.locator('input[name="contact_email"]').fill("junior@example.test");
  await expectNoOverflow("About you stage");
  await form.getByRole("button", { name: "Continue" }).click();

  await expect(form.getByRole("group", { name: "Payment method" })).toBeVisible();
  await expectNoOverflow("Payment stage");
  await form.getByRole("button", { name: "Continue" }).click();

  await expect(form.getByRole("heading", { name: "Before you submit" })).toBeVisible();
  await expect(form.getByText(/membership card and lanyard/)).toBeVisible();
  await expectNoOverflow("Review stage");
});
