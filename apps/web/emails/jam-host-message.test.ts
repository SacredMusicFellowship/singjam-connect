import { describe, it, expect } from "vitest";
import { jamHostMessageHtml } from "./jam-host-message";

const base = {
  hostName: "Ben",
  jamName: "Thursday Night Jam",
  jamUrl: "https://singjam.org/jam/1",
  subject: "Heads up about parking",
  body: "Hey everyone, parking is tight on Thursday.",
};

describe("jamHostMessageHtml", () => {
  it("renders the subject in the heading", () => {
    const html = jamHostMessageHtml(base);
    expect(html).toContain("Heads up about parking");
  });

  it("renders host name and jam name in the header line", () => {
    const html = jamHostMessageHtml(base);
    expect(html).toContain("Ben");
    expect(html).toContain("Thursday Night Jam");
  });

  it("adds no greeting of its own, so the host's message opens the email", () => {
    const html = jamHostMessageHtml(base);
    expect(html).not.toMatch(/>\s*Hi[ ,]/);
    expect(html).toContain("Hey everyone, parking is tight on Thursday.");
  });

  it("escapes what the host typed, so it can't add links or markup", () => {
    const html = jamHostMessageHtml({
      ...base,
      hostName: "Eve <b>",
      jamName: "Jam & Jelly",
      subject: '<a href="https://evil.example">Pay here</a>',
      body: '<script>alert(1)</script>\n<img src=x onerror="x">',
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;<br>&lt;img");
    expect(html).toContain("Eve &lt;b&gt;");
    expect(html).toContain("Jam &amp; Jelly");
  });

  it("converts newlines in body to <br>", () => {
    const html = jamHostMessageHtml({ ...base, body: "Line one\nLine two" });
    expect(html).toContain("Line one<br>Line two");
  });

  it("includes the jam URL", () => {
    const html = jamHostMessageHtml(base);
    expect(html).toContain("https://singjam.org/jam/1");
  });
});
