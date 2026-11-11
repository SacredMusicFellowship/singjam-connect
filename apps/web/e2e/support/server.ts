import { localSupabaseKeys } from "@singjam/test-fixtures/local-supabase";

export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

// Every key the app reads, set to a local or fake value. Variables set here win over .env.local,
// so running the suite from a checkout that has real keys still can't reach a real service.
export function e2eServerEnv(): Record<string, string> {
  const supabase = localSupabaseKeys();
  return {
    E2E: "1",
    MOCK_OUTSIDE_SERVICES: "true",
    ALLOW_DEV_SIDE_EFFECTS: "true",
    NEXT_DIST_DIR: ".next-e2e",
    NEXT_PUBLIC_SITE_URL: E2E_BASE_URL,
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
}
