// npm run e2e:setup — checks what the test suite needs, installs the Playwright browsers, and starts
// a local Supabase with every migration and the fake seed. Safe to run again at any time.
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

// Docker Desktop puts its CLI here; non-login shells often miss it.
process.env.PATH = [path.join(os.homedir(), ".docker", "bin"), process.env.PATH].join(path.delimiter);

const problems = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg, fix) => {
  console.log(`  ✗ ${msg}`);
  problems.push(fix);
};
const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

console.log("Checking prerequisites");

const [major, minor] = process.versions.node.split(".").map(Number);
if (major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19)) ok(`Node ${process.versions.node}`);
else fail(`Node ${process.versions.node}`, "Install Node 20.19+ or 22.12+ (see engines in package.json).");

if (run("docker", ["info", "--format", "{{.ServerVersion}}"])) ok("Docker is running");
else fail("Docker isn't running", "Install Docker Desktop (or OrbStack) and start it.");

const supabaseVersion = run("supabase", ["--version"]);
if (supabaseVersion) ok(`Supabase CLI ${supabaseVersion}`);
else fail("Supabase CLI not found", "Install it: brew install supabase/tap/supabase");

if (problems.length) {
  console.log("\nFix these, then run npm run e2e:setup again:");
  for (const fix of problems) console.log(`  - ${fix}`);
  process.exit(1);
}

console.log("\nInstalling Playwright browsers (Chromium and WebKit)");
const install = spawnSync("npx", ["playwright", "install", "chromium", "webkit"], { cwd: "apps/web", stdio: "inherit" });
if (install.status !== 0) process.exit(install.status ?? 1);

console.log("\nStarting local Supabase (first run downloads images; migrations and the fake seed load on a new database)");
const start = spawnSync("supabase", ["start"], { stdio: "inherit" });
if (start.status !== 0) process.exit(start.status ?? 1);

console.log(`
Ready. Everything runs against fake members on this machine:
  npm run e2e               Playwright on desktop Chrome, iPhone Safari and Android Chrome
  npm run test:rls          RLS tests against the local database
  npm run e2e:screenshots   screenshots of every main screen into pr-assets/<branch>/web/
  npm run e2e:db:reset      reload the migrations and the fake seed

Signed-in fake members all use the password in packages/test-fixtures/src/constants.ts.
See TESTING.md for the rest.`);
