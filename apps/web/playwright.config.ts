import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL as baseURL, E2E_PORT, e2eServerEnv } from "./e2e/support/server";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  // next dev compiles each route on its first request, which can take several seconds.
  expect: { timeout: 15_000, toPass: { timeout: 15_000 } },
  reporter: [[process.env.CI ? "github" : "list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /\.setup\.ts$/ },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
    { name: "iphone-safari", use: { ...devices["iPhone 15"] }, dependencies: ["setup"] },
    { name: "android-chrome", use: { ...devices["Pixel 7"] }, dependencies: ["setup"] },
    // Only with npm run e2e:screenshots, so a normal run never writes images.
    ...(process.env.E2E_SCREENSHOTS
      ? [
          { name: "screenshots-phone", testMatch: /\.capture\.ts$/, use: { ...devices["iPhone 15"] }, dependencies: ["setup"] },
          { name: "screenshots-desktop", testMatch: /\.capture\.ts$/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } }, dependencies: ["setup"] },
        ]
      : []),
  ],
  webServer: {
    command: `npx next dev --port ${E2E_PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: e2eServerEnv(),
  },
});
