import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildScenario, E2E_PASSWORD } from "@singjam/test-fixtures";
import { localSupabaseKeys } from "@singjam/test-fixtures/local-supabase";
import { E2E_PORT, e2eServerEnv } from "../../web/e2e/support/server";

// npm run e2e:native runs the Maestro flows in e2e/flows on the "SingJam E2E" iOS simulator and the
// SingJamE2E Android emulator, against local Supabase and the e2e web server, with the app's
// JavaScript served by a Metro started here per platform. Screenshots land in
// pr-assets/<branch>/native/<platform>/.
//
//   npm run e2e:native                     both platforms
//   npm run e2e:native -- --platform ios   one platform
//   npm run e2e:native -- --serve ios      only start the servers, for writing new flows

type Platform = "ios" | "android";

const IOS_SIMULATOR = "SingJam E2E";
const ANDROID_AVD = "SingJamE2E";
const APP_ID = "org.singjam.app";
// The Android emulator reaches this machine as 10.0.2.2; the iOS simulator shares its localhost.
const HOST: Record<Platform, string> = { ios: "localhost", android: "10.0.2.2" };
const METRO_PORT: Record<Platform, number> = { ios: 8082, android: 8083 };

const nativeDir = path.resolve(import.meta.dirname, "..");
const webDir = path.resolve(nativeDir, "..", "web");
const repoRoot = path.resolve(nativeDir, "..", "..");
const children: ChildProcess[] = [];

const args = process.argv.slice(2);
const serveIndex = args.indexOf("--serve");
const platformIndex = args.indexOf("--platform");
const only = (serveIndex >= 0 ? args[serveIndex + 1] : platformIndex >= 0 ? args[platformIndex + 1] : undefined) as
  | Platform
  | undefined;
const platforms: Platform[] = only ? [only] : ["ios", "android"];

const androidHome = process.env.ANDROID_HOME ?? path.join(os.homedir(), "Library", "Android", "sdk");
const adb = path.join(androidHome, "platform-tools", "adb");

async function isUp(url: string): Promise<boolean> {
  return fetch(url).then((r) => r.ok, () => false);
}

async function waitFor(check: () => Promise<boolean> | boolean, what: string, timeoutMs = 300_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${what} didn't become ready within ${timeoutMs / 1000}s`);
}

function start(command: string, commandArgs: string[], cwd: string, env: Record<string, string>): void {
  const child = spawn(command, commandArgs, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "inherit"] });
  children.push(child);
}

function prepareMaestro(): Record<string, string> {
  // Native Instruments' NTKDaemon listens on 5563, inside the emulator port range Maestro probes
  // before every run; it accepts the connection and never answers, so Maestro hangs. Quit it for
  // the run. Native Access starts it again when it's next needed.
  if (spawnSync("pkill", ["-x", "NTKDaemon"]).status === 0) {
    console.log("Quit NTKDaemon (Native Instruments) so Maestro doesn't hang on port 5563.");
  }
  const env: Record<string, string> = { MAESTRO_CLI_NO_ANALYTICS: "1", MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true" };
  // Maestro and the Android build want JDK 17; Homebrew's is keg-only.
  const jdk17 = "/opt/homebrew/opt/openjdk@17";
  if (!process.env.JAVA_HOME && fs.existsSync(jdk17)) {
    env.JAVA_HOME = jdk17;
    env.PATH = `${jdk17}/bin:${process.env.PATH}`;
  }
  return env;
}

function iosDevice(): string {
  const { devices } = JSON.parse(execFileSync("xcrun", ["simctl", "list", "devices", "-j"], { encoding: "utf8" }));
  const device = Object.values(devices as Record<string, { name: string; udid: string; isAvailable: boolean }[]>)
    .flat()
    .find((d) => d.name === IOS_SIMULATOR && d.isAvailable);
  if (!device) throw new Error(`No "${IOS_SIMULATOR}" simulator. Create one: xcrun simctl create "${IOS_SIMULATOR}" "iPhone 17 Pro"`);
  spawnSync("xcrun", ["simctl", "boot", device.udid]);
  execFileSync("xcrun", ["simctl", "bootstatus", device.udid, "-b"], { stdio: "ignore" });
  if (spawnSync("xcrun", ["simctl", "get_app_container", device.udid, APP_ID]).status !== 0) {
    throw new Error(`SingJam isn't installed on "${IOS_SIMULATOR}". From apps/native: npx expo run:ios --device "${IOS_SIMULATOR}"`);
  }
  return device.udid;
}

async function androidDevice(): Promise<string> {
  if (!fs.existsSync(adb)) throw new Error(`No Android SDK at ${androidHome}. See TESTING.md › Native e2e.`);
  const running = () =>
    execFileSync(adb, ["devices"], { encoding: "utf8" })
      .split("\n")
      .map((line) => line.split("\t"))
      .find(([serial, state]) => serial.startsWith("emulator-") && state === "device")?.[0];
  if (!running()) {
    start(path.join(androidHome, "emulator", "emulator"), ["-avd", ANDROID_AVD, "-no-snapshot-save", "-no-audio", "-gpu", "host"], nativeDir, {});
  }
  await waitFor(() => Boolean(running()), "The Android emulator");
  const serial = running()!;
  await waitFor(
    () => execFileSync(adb, ["-s", serial, "shell", "getprop", "sys.boot_completed"], { encoding: "utf8" }).trim() === "1",
    "Android boot",
  );
  // Animations slow the emulator down and make taps land mid-transition.
  for (const setting of ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"]) {
    execFileSync(adb, ["-s", serial, "shell", "settings", "put", "global", setting, "0"]);
  }
  // The emulator's data partition doesn't survive a cold boot, so reinstall the last dev build.
  const installed = () =>
    execFileSync(adb, ["-s", serial, "shell", "pm", "list", "packages", APP_ID], { encoding: "utf8" }).includes(APP_ID);
  const apk = path.join(nativeDir, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (!installed() && fs.existsSync(apk)) {
    await waitFor(() => execFileSync(adb, ["-s", serial, "shell", "pm", "path", "android"], { encoding: "utf8" }).includes("package:"), "The package manager");
    execFileSync(adb, ["-s", serial, "install", "-r", apk], { stdio: "ignore" });
  }
  if (!installed()) {
    throw new Error(`SingJam isn't installed on the ${ANDROID_AVD} emulator. From apps/native: npx expo run:android --no-bundler`);
  }
  return serial;
}

async function startServers(platform: Platform): Promise<string> {
  const supabase = localSupabaseKeys();
  const host = HOST[platform];
  const webUrl = `http://localhost:${E2E_PORT}`;
  if (!(await isUp(webUrl))) start("npx", ["next", "dev", "--port", String(E2E_PORT)], webDir, e2eServerEnv());

  const port = METRO_PORT[platform];
  const metroUrl = `http://localhost:${port}`;
  if (!(await isUp(`${metroUrl}/status`))) {
    start("npx", ["expo", "start", "--dev-client", "--port", String(port)], nativeDir, {
      CI: "1",
      EXPO_PUBLIC_E2E: "1",
      EXPO_PUBLIC_SUPABASE_URL: supabase.url.replace(/127\.0\.0\.1|localhost/, host),
      EXPO_PUBLIC_SUPABASE_ANON_KEY: supabase.anonKey,
      EXPO_PUBLIC_WEB_URL: `http://${host}:${E2E_PORT}`,
      EXPO_PUBLIC_GOOGLE_PLACES_API_KEY: "e2e-fake",
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "e2e-fake",
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "e2e-fake",
    });
  }
  await Promise.all([waitFor(() => isUp(webUrl), "The e2e web server"), waitFor(() => isUp(`${metroUrl}/status`), "Metro")]);
  return `http://${host}:${port}`;
}

function runFlows(platform: Platform, device: string, metroUrl: string, maestroEnv: Record<string, string>): void {
  const { refs } = buildScenario();
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  const screenshotDir = path.join(repoRoot, "pr-assets", branch, "native", platform);
  fs.mkdirSync(screenshotDir, { recursive: true });
  const flowEnv = {
    DEV_CLIENT_URL: `singjam://expo-development-client/?url=${encodeURIComponent(metroUrl)}`,
    PLATFORM: platform,
    PASSWORD: E2E_PASSWORD,
    MEMBER_EMAIL: refs.members.member.auth.email,
    NEWCOMER_EMAIL: refs.members.newcomer.auth.email,
    OFFICIAL_JAM: refs.jams.officialNext.name,
    COMMUNITY_JAM: refs.jams.communityUpcoming.name,
    PRIVATE_JAM: refs.jams.privateUpcoming.name,
    HOST_NAME: `${refs.members.host.profile.display_name} ${refs.members.host.profile.last_name}`,
  };
  console.log(`\nRunning the Maestro flows on ${platform} (${device})`);
  const debugDir = fs.mkdtempSync(path.join(os.tmpdir(), `maestro-${platform}-`));
  const result = spawnSync(
    "maestro",
    [
      "--device", device, "test", `--debug-output=${debugDir}`, path.join(nativeDir, "e2e", "flows"),
      ...Object.entries(flowEnv).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    ],
    { cwd: screenshotDir, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, ...maestroEnv } },
  );
  // Maestro writes takeScreenshot images into its debug output, one folder per flow.
  for (const file of fs.readdirSync(debugDir, { recursive: true }) as string[]) {
    if (path.basename(path.dirname(file)) === "takeScreenshot" && file.endsWith(".png")) {
      fs.copyFileSync(path.join(debugDir, file), path.join(screenshotDir, path.basename(file)));
    }
  }
  fs.rmSync(debugDir, { recursive: true, force: true });
  console.log(`Screenshots: ${path.relative(repoRoot, screenshotDir)}`);
  if (result.status !== 0) throw new Error(`Maestro flows failed on ${platform}`);
}

async function main() {
  const maestroEnv = prepareMaestro();
  for (const platform of platforms) {
    const device = platform === "ios" ? iosDevice() : await androidDevice();
    const metroUrl = await startServers(platform);
    if (serveIndex >= 0) {
      console.log(`Serving ${platform}: Metro ${metroUrl}, device ${device}. Ctrl-C to stop.`);
      await new Promise(() => {});
    }
    runFlows(platform, device, metroUrl, maestroEnv);
  }
}

process.on("SIGINT", () => process.exit(130));
process.on("exit", () => {
  children.forEach((child) => child.kill());
  // next dev with NEXT_DIST_DIR=.next-e2e repoints next-env.d.ts; put it back so a run leaves git clean.
  const nextEnv = path.join(webDir, "next-env.d.ts");
  fs.writeFileSync(nextEnv, fs.readFileSync(nextEnv, "utf8").replace("./.next-e2e/types/", "./.next/types/"));
});
main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
