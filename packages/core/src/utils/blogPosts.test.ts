import { describe, it, expect } from "vitest";
import { slugifyBlogTitle, isValidBlogSlug, blogPostUrl, formatBlogDate, blogReadingMinutes } from "./blogPosts";

describe("slugifyBlogTitle", () => {
  it("makes a valid slug from a title", () => {
    const slug = slugifyBlogTitle("Inside SingJam: November 2026 — Tickets & Fees!");
    expect(slug).toBe("inside-singjam-november-2026-tickets-and-fees");
    expect(isValidBlogSlug(slug)).toBe(true);
  });

  it("strips accents", () => {
    expect(slugifyBlogTitle("Café jams")).toBe("cafe-jams");
  });

  it("caps length without a trailing hyphen", () => {
    const slug = slugifyBlogTitle("a ".repeat(100));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(isValidBlogSlug(slug)).toBe(true);
  });
});

describe("isValidBlogSlug", () => {
  it("rejects uppercase, spaces and edge hyphens", () => {
    expect(isValidBlogSlug("Hello")).toBe(false);
    expect(isValidBlogSlug("a b")).toBe(false);
    expect(isValidBlogSlug("-a")).toBe(false);
    expect(isValidBlogSlug("")).toBe(false);
  });
});

describe("blogPostUrl", () => {
  it("points at inside.singjam.org", () => {
    expect(blogPostUrl("october-2026")).toBe("https://inside.singjam.org/october-2026");
  });
});

describe("formatBlogDate", () => {
  it("formats in UTC", () => {
    expect(formatBlogDate("2026-11-10T23:30:00Z")).toBe("November 10, 2026");
    expect(formatBlogDate(null)).toBeNull();
  });
});

describe("blogReadingMinutes", () => {
  it("rounds to whole minutes, at least one", () => {
    expect(blogReadingMinutes("")).toBe(1);
    expect(blogReadingMinutes("word ".repeat(660))).toBe(3);
  });
});

describe("slugifyBlogTitle on long runs of separators", () => {
  it("stays fast and valid", () => {
    const start = Date.now();
    const slug = slugifyBlogTitle("a" + "-".repeat(100000) + "!");
    expect(Date.now() - start).toBeLessThan(100);
    expect(slug).toBe("a");
  });
});
