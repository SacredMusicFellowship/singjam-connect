import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { loadAllBlogPosts, loadBlogPosts, blogPostFiles, BLOG_DIR } from "./blog";

const dirs: string[] = [];
function tmpBlog(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const post = (title: string, date: string, extra = "") => `---\ntitle: ${title}\ndate: ${date}\n${extra}---\nBody`;

describe("the real content/blog folder", () => {
  it("has only valid posts (a bad file fails CI here, not the deploy)", () => {
    expect(() => loadAllBlogPosts(BLOG_DIR)).not.toThrow();
  });
});

describe("loadBlogPosts", () => {
  it("skips the README and _template, sorts newest first, and hides drafts", () => {
    const dir = tmpBlog({
      "README.md": "# How to",
      "_template.md": "---\ntitle:\n---\n",
      "september-2026.md": post("Sept", "2026-10-12"),
      "october-2026.md": post("Oct", "2026-11-10"),
      "november-2026.md": post("Nov", "2026-12-08", "draft: true\n"),
    });
    expect(blogPostFiles(dir).sort()).toEqual(["november-2026.md", "october-2026.md", "september-2026.md"]);
    expect(loadBlogPosts(dir).map((p) => p.slug)).toEqual(["october-2026", "september-2026"]);
    expect(loadAllBlogPosts(dir).map((p) => p.slug)).toEqual(["november-2026", "october-2026", "september-2026"]);
  });

  it("names every bad file in one error", () => {
    const dir = tmpBlog({ "Bad Name.md": post("A", "2026-11-10"), "no-date.md": "---\ntitle: A\n---\n" });
    expect(() => loadAllBlogPosts(dir)).toThrow(/Bad Name\.md[\s\S]*no-date\.md|no-date\.md[\s\S]*Bad Name\.md/);
  });

  it("returns nothing for a missing folder", () => {
    expect(loadAllBlogPosts(path.join(os.tmpdir(), "does-not-exist-blog"))).toEqual([]);
  });
});
