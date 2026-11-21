import fs from "node:fs";
import path from "node:path";

// `next dev` with NEXT_DIST_DIR=.next-e2e points next-env.d.ts at its own folder. Put it back so an
// e2e run leaves no change in git.
export default function globalTeardown() {
  const file = path.join(import.meta.dirname, "..", "next-env.d.ts");
  const content = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, content.replace("./.next-e2e/types/", "./.next/types/"));
}
