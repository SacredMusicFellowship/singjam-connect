import { describe, it, expect } from "vitest";
import { parseBlogMarkdown, parseBlogInline, safeBlogHref, blogInlineText } from "./blogMarkdown";

describe("parseBlogInline", () => {
  it("keeps plain text as one node", () => {
    expect(parseBlogInline("Hello world")).toEqual([{ type: "text", text: "Hello world" }]);
  });

  it("parses bold, italic, code and links", () => {
    expect(parseBlogInline("A **big** *new* `fetchAllRows` [PR](https://github.com/x/y/pull/1)")).toEqual([
      { type: "text", text: "A " },
      { type: "strong", children: [{ type: "text", text: "big" }] },
      { type: "text", text: " " },
      { type: "em", children: [{ type: "text", text: "new" }] },
      { type: "text", text: " " },
      { type: "code", text: "fetchAllRows" },
      { type: "text", text: " " },
      { type: "link", href: "https://github.com/x/y/pull/1", children: [{ type: "text", text: "PR" }] },
    ]);
  });

  it("nests italic inside bold", () => {
    expect(parseBlogInline("**very *fast* fix**")[0]).toEqual({
      type: "strong",
      children: [{ type: "text", text: "very " }, { type: "em", children: [{ type: "text", text: "fast" }] }, { type: "text", text: " fix" }],
    });
  });

  it("does not treat underscores inside words as italics", () => {
    expect(parseBlogInline("song_popularity_counts")).toEqual([{ type: "text", text: "song_popularity_counts" }]);
  });

  it("leaves unmatched markers as text", () => {
    expect(blogInlineText(parseBlogInline("5 * 3 and **open"))).toBe("5 * 3 and **open");
  });

  it("drops unsafe links but keeps their label", () => {
    expect(parseBlogInline("[click](javascript:void)")).toEqual([{ type: "text", text: "click" }]);
  });

  it("shows raw HTML as text", () => {
    expect(parseBlogInline("<script>x</script>")).toEqual([{ type: "text", text: "<script>x</script>" }]);
  });
});

describe("safeBlogHref", () => {
  it("allows web, mail and site-relative links only", () => {
    expect(safeBlogHref("https://singjam.org")).toBe("https://singjam.org");
    expect(safeBlogHref("mailto:hi@singjam.org")).toBe("mailto:hi@singjam.org");
    expect(safeBlogHref("/jams")).toBe("/jams");
    expect(safeBlogHref("//evil.com")).toBeNull();
    expect(safeBlogHref("data:text/html,x")).toBeNull();
  });
});

describe("parseBlogMarkdown", () => {
  it("parses a typical monthly post", () => {
    const md = [
      "# What we shipped in October",
      "",
      "A month of **ticketing** work.",
      "It spans two lines.",
      "",
      "## Highlights",
      "- Stripe fees on the ticket manager",
      "- Faster catalogue",
      "  with a wrapped line",
      "",
      "1. First",
      "2. Second",
      "",
      "> Ship small, ship often.",
      "",
      "---",
      "",
      "![The new ticket manager](https://example.com/a.png)",
      "",
      "```",
      "npm run build",
      "```",
    ].join("\n");

    expect(parseBlogMarkdown(md)).toEqual([
      { type: "heading", level: 1, children: [{ type: "text", text: "What we shipped in October" }] },
      {
        type: "paragraph",
        children: [
          { type: "text", text: "A month of " },
          { type: "strong", children: [{ type: "text", text: "ticketing" }] },
          { type: "text", text: " work. It spans two lines." },
        ],
      },
      { type: "heading", level: 2, children: [{ type: "text", text: "Highlights" }] },
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", text: "Stripe fees on the ticket manager" }],
          [{ type: "text", text: "Faster catalogue with a wrapped line" }],
        ],
      },
      { type: "list", ordered: true, items: [[{ type: "text", text: "First" }], [{ type: "text", text: "Second" }]] },
      { type: "quote", children: [{ type: "text", text: "Ship small, ship often." }] },
      { type: "rule" },
      { type: "image", alt: "The new ticket manager", src: "https://example.com/a.png" },
      { type: "code", text: "npm run build" },
    ]);
  });

  it("ends a paragraph where a list starts without a blank line", () => {
    expect(parseBlogMarkdown("Intro:\n- one").map((b) => b.type)).toEqual(["paragraph", "list"]);
  });

  it("only accepts https images", () => {
    expect(parseBlogMarkdown("![x](http://example.com/a.png)")[0].type).toBe("paragraph");
  });

  it("handles Windows line endings and empty input", () => {
    expect(parseBlogMarkdown("# A\r\n\r\nB")).toHaveLength(2);
    expect(parseBlogMarkdown("")).toEqual([]);
  });
});
