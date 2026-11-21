// Every timestamp in a scenario is computed from this instant, so output never depends on the
// clock. The seed writer shifts them so "upcoming" jams stay upcoming whenever the seed is loaded.
export const FIXED_NOW = new Date("2026-06-01T19:00:00.000Z");

export const DEFAULT_SEED = 20260601;

// .test is reserved (RFC 2606), so these addresses can never reach a real inbox.
export const EMAIL_DOMAIN = "singjam.test";

// Only ever used against a throwaway local database.
export const E2E_PASSWORD = "singjam-e2e-password";

export const TIMEZONE = "America/Los_Angeles";
