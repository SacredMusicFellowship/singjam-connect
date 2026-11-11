import { describe, it, expect } from "vitest";
import {
  isValidBlogSlug,
  parseBlogFrontmatter,
  blogPostFromFile,
  sortBlogPosts,
  blogPostUrl,
  formatBlogDate,
  blogReadingMinutes,
} from "./blogPosts";

const FILE = [
  "---",
  "title: Inside SingJam — October 2026",
  "date: 2026-11-10",
  'author: "Jane Mendonca"',
  "summary: Ticket fees: what hosts now see",
  "---",
  "",
  "## Shipped",
  "- One",
].join("\n");

describe("isValidBlogSlug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(isValidBlogSlug("october-2026")).toBe(true);
  });

  it("rejects uppercase, spaces, edge or double hyphens", () => {
    for (const s of ["Hello", "a b", "-a", "a-", "a--b", ""]) expect(isValidBlogSlug(s)).toBe(false);
  });
});

describe("parseBlogFrontmatter", () => {
  it("splits meta from body, unquoting values and keeping colons in values", () => {
    const { meta, body } = parseBlogFrontmatter(FILE);
    expect(meta).toEqual({
      title: "Inside SingJam — October 2026",
      date: "2026-11-10",
      author: "Jane Mendonca",
      summary: "Ticket fees: what hosts now see",
    });
    expect(body).toBe("## Shipped\n- One");
  });

  it("treats a file without frontmatter as all body", () => {
    expect(parseBlogFrontmatter("# Hi")).toEqual({ meta: {}, body: "# Hi" });
  });

  it("handles Windows line endings", () => {
    expect(parseBlogFrontmatter("---\r\ntitle: A\r\n---\r\nBody").meta.title).toBe("A");
  });
});

describe("blogPostFromFile", () => {
  it("builds a post", () => {
    const r = blogPostFromFile("october-2026", FILE);
    expect(r).toEqual({
      ok: true,
      post: {
        slug: "october-2026",
        title: "Inside SingJam — October 2026",
        summary: "Ticket fees: what hosts now see",
        cover_image_url: null,
        author_name: "Jane Mendonca",
        published_at: "2026-11-10T00:00:00.000Z",
        draft: false,
        body_md: "## Shipped\n- One",
      },
    });
  });

  it("reads the draft flag", () => {
    const r = blogPostFromFile("a", "---\ntitle: A\ndate: 2026-11-10\ndraft: true\n---\nx");
    expect(r.ok && r.post.draft).toBe(true);
  });

  it("explains what's wrong with a bad file", () => {
    expect(blogPostFromFile("Bad Name", FILE)).toMatchObject({ ok: false });
    expect(blogPostFromFile("a", "---\ndate: 2026-11-10\n---\n")).toEqual({ ok: false, error: 'a.md: missing "title:"' });
    expect(blogPostFromFile("a", "---\ntitle: A\ndate: Nov 10\n---\n")).toEqual({ ok: false, error: 'a.md: "date:" must be YYYY-MM-DD' });
    expect(blogPostFromFile("a", "---\ntitle: A\ndate: 2026-11-10\ncover: http://x.com/a.png\n---\n").ok).toBe(false);
  });
});

describe("sortBlogPosts", () => {
  it("puts the newest first and breaks ties by slug", () => {
    const p = (slug: string, published_at: string) => ({ slug, title: slug, summary: null, cover_image_url: null, author_name: null, published_at });
    expect(sortBlogPosts([p("b", "2026-10-01"), p("c", "2026-11-01"), p("a", "2026-10-01")]).map((x) => x.slug)).toEqual(["c", "a", "b"]);
  });
});

describe("blogPostUrl", () => {
  it("points at inside.singjam.org", () => {
    expect(blogPostUrl("october-2026")).toBe("https://inside.singjam.org/october-2026");
  });
});

describe("formatBlogDate", () => {
  it("formats in UTC", () => {
    expect(formatBlogDate("2026-11-10T00:00:00.000Z")).toBe("November 10, 2026");
    expect(formatBlogDate(null)).toBeNull();
  });
});

describe("blogReadingMinutes", () => {
  it("rounds to whole minutes, at least one", () => {
    expect(blogReadingMinutes("")).toBe(1);
    expect(blogReadingMinutes("word ".repeat(660))).toBe(3);
  });
});
