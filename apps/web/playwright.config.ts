import { defineConfig, devices } from "@playwright/test";
import { localSupabaseKeys } from "@singjam/test-fixtures/local-supabase";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const supabase = localSupabaseKeys();

// Every key the app reads, set to a local or fake value. Variables set here win over .env.local,
// so running the suite from a checkout that has real keys still can't reach a real service.
const serverEnv: Record<string, string> = {
  E2E: "1",
  MOCK_OUTSIDE_SERVICES: "true",
  ALLOW_DEV_SIDE_EFFECTS: "true",
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_PUBLIC_SITE_URL: baseURL,
  NEXT_PUBLIC_SUPABASE_URL: supabase.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
  SUPABASE_ACCESS_TOKEN: "sbp_e2e_fake",
  ADMIN_EMAIL: "admin@singjam.test",
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: "e2e-fake-maps-key",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_e2e_fake",
  STRIPE_RESTRICTED_KEY: "rk_test_e2e_fake",
  STRIPE_WEBHOOK_SECRET: "whsec_e2e_fake",
  STRIPE_TICKET_PM_CONFIG: "pmc_e2e_fake",
  RESEND_API_KEY: "re_e2e_fake",
  AC_API_URL: "https://e2e.api-us1.com",
  AC_API_KEY: "e2e-fake",
  OPENAI_API_KEY: "sk-e2e-fake",
  SPOTIFY_CLIENT_ID: "e2e-fake",
  SPOTIFY_CLIENT_SECRET: "e2e-fake",
  SPOTIFY_REFRESH_TOKEN: "e2e-fake",
  GENIUS_ACCESS_TOKEN: "e2e-fake",
  LASTFM_API_KEY: "e2e-fake",
  YOUTUBE_API_KEY: "e2e-fake",
  YOUTUBE_REFRESH_TOKEN: "e2e-fake",
  GOOGLE_CLIENT_ID: "e2e-fake",
  GOOGLE_CLIENT_SECRET: "e2e-fake",
};

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
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: serverEnv,
  },
});
