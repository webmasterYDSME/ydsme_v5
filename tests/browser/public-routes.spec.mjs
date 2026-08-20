import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/events", "/news", "/membership", "/signin"];

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
