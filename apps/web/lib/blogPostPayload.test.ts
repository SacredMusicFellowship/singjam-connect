import { describe, it, expect } from "vitest";
import { blogPostPayload } from "./blogPostPayload";

const NOW = new Date("2026-11-11T12:00:00Z");

describe("blogPostPayload", () => {
  it("requires a title", () => {
    expect(blogPostPayload({ title: "  " })).toEqual({ ok: false, error: "Title is required" });
  });

  it("derives the slug from the title when none is given", () => {
    const r = blogPostPayload({ title: "October 2026: What We Shipped" }, NOW);
    expect(r.ok && r.row.slug).toBe("october-2026-what-we-shipped");
  });

  it("rejects an invalid slug", () => {
    expect(blogPostPayload({ title: "A", slug: "Not OK" }).ok).toBe(false);
  });

  it("defaults to draft with no publish date", () => {
    const r = blogPostPayload({ title: "A" }, NOW);
    expect(r.ok && r.row.status).toBe("draft");
    expect(r.ok && r.row.published_at).toBeNull();
  });

  it("stamps the publish date when publishing without one", () => {
    const r = blogPostPayload({ title: "A", status: "published" }, NOW);
    expect(r.ok && r.row.published_at).toBe("2026-11-11T12:00:00.000Z");
  });

  it("keeps a given publish date, normalised to ISO", () => {
    const r = blogPostPayload({ title: "A", status: "published", published_at: "2026-11-09T09:00:00-08:00" }, NOW);
    expect(r.ok && r.row.published_at).toBe("2026-11-09T17:00:00.000Z");
  });

  it("keeps the date on a post moved back to draft", () => {
    const r = blogPostPayload({ title: "A", status: "draft", published_at: "2026-11-09T17:00:00Z" }, NOW);
    expect(r.ok && r.row.published_at).toBe("2026-11-09T17:00:00.000Z");
  });

  it("rejects a bad date or a non-https cover", () => {
    expect(blogPostPayload({ title: "A", published_at: "soon" }).ok).toBe(false);
    expect(blogPostPayload({ title: "A", cover_image_url: "http://x.com/a.png" }).ok).toBe(false);
  });

  it("blanks empty optional fields and keeps the body as written", () => {
    const r = blogPostPayload({ title: "A", summary: " ", author_name: "", body_md: "  # Hi\n" }, NOW);
    expect(r.ok && r.row).toMatchObject({ summary: null, author_name: null, body_md: "  # Hi\n" });
  });
});
