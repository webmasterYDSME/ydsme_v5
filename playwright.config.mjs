import { defineConfig } from "@playwright/test";

const journeyPort = process.env.JOURNEY_PORT || "3010";
const journeyBaseUrl = `http://127.0.0.1:${journeyPort}`;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    baseURL: journeyBaseUrl,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/start-journey-app.mjs",
    url: `${journeyBaseUrl}/signin`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      JOURNEY_START_MODE: process.env.JOURNEY_START_MODE || "production",
      JOURNEY_PORT: journeyPort,
    },
  },
});
