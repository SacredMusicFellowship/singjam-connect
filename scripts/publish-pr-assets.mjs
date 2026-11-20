// npm run pr-assets:publish copies pr-assets/<current branch>/ onto the orphan `pr-assets` branch,
// pushes it, and prints links pinned to that commit for the PR description. pr-assets/ is gitignored,
// so screenshots never appear in a PR diff. Fake-data screenshots only: the repo is public.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const git = (args, cwd = process.cwd()) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const root = git(["rev-parse", "--show-toplevel"]);
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const source = path.join(root, "pr-assets", branch);
if (!fs.existsSync(source)) {
  console.error(`Nothing to publish: ${path.relative(root, source)} doesn't exist. Run npm run e2e:screenshots first.`);
  process.exit(1);
}
const repo = git(["remote", "get-url", "origin"]).replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");

const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "pr-assets-"));
try {
  git(["fetch", "origin", "pr-assets"]);
  git(["worktree", "add", "--detach", worktree, "origin/pr-assets"]);
  const target = path.join(worktree, branch);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
  git(["add", "-A", branch], worktree);
  if (git(["status", "--porcelain"], worktree)) {
    git(["commit", "-m", `chore: publish PR assets for ${branch}`], worktree);
    git(["push", "origin", "HEAD:pr-assets"], worktree);
  }
  const sha = git(["rev-parse", "HEAD"], worktree);
  const files = git(["ls-files", branch], worktree).split("\n").filter(Boolean);
  console.log(`Published ${files.length} file(s). Paste into the PR description:\n`);
  for (const file of files) {
    const url = `https://raw.githubusercontent.com/${repo}/${sha}/${file}`;
    const name = path.basename(file);
    console.log(/\.(png|jpe?g|gif|webp)$/i.test(name) ? `<img src="${url}" width="320" alt="${name}">` : `[${name}](${url})`);
  }
} finally {
  git(["worktree", "remove", "--force", worktree]);
}
