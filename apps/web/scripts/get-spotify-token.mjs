#!/usr/bin/env node
/**
 * One-time script to get a Spotify refresh token.
 *
 * Run: node scripts/get-spotify-token.mjs
 *
 * Steps:
 *   1. Visit the printed URL in your browser and approve.
 *   2. You'll be redirected to http://127.0.0.1:8888/callback?code=...
 *      The page won't load — that's fine. Copy the full URL from the address bar.
 *   3. Paste it here when prompted.
 *   4. Add the printed SPOTIFY_REFRESH_TOKEN to .env.local
 */

import { createInterface } from "readline";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.resolve(__dirname, "../.env.local");
const envVars = {};
try {
  readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) envVars[key.trim()] = rest.join("=").trim();
  });
} catch {
  console.error("Could not read .env.local");
  process.exit(1);
}

const CLIENT_ID = envVars.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = envVars.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = "http://127.0.0.1:8888/callback";
const SCOPES = "playlist-modify-private playlist-modify-public user-read-private";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env.local");
  process.exit(1);
}

const authUrl =
  `https://accounts.spotify.com/authorize` +
  `?response_type=code` +
  `&client_id=${CLIENT_ID}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

console.log("\nStep 1 — Visit this URL in your browser:\n");
console.log(" ", authUrl);
console.log("\nStep 2 — Approve the permissions.");
console.log("Step 3 — The page won't load. Copy the full URL from the address bar.\n");

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question("Paste the full redirect URL here: ", async (redirected) => {
  rl.close();
  let code;
  try {
    code = new URL(redirected).searchParams.get("code");
  } catch {
    console.error("Invalid URL");
    process.exit(1);
  }
  if (!code) {
    console.error("No code found in URL");
    process.exit(1);
  }

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    console.error("Token exchange failed:", await tokenRes.text());
    process.exit(1);
  }

  const tokens = await tokenRes.json();
  console.log("\n✅ Add this to .env.local:\n");
  console.log(`SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}\n`);
});
