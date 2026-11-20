import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChordsLink from "./ChordsLink";

describe("ChordsLink", () => {
  it("links to an Ultimate Guitar chart", () => {
    const html = renderToStaticMarkup(<ChordsLink href="https://tabs.ultimate-guitar.com/tab/x/y-chords-1" />);
    expect(html.match(/href="https:\/\/tabs\.ultimate-guitar\.com\/tab\/x\/y-chords-1"/g)).toHaveLength(2);
    expect(html).toContain(">Chords</span>");
  });

  it("keeps markup in a link as text, never as elements", () => {
    const html = renderToStaticMarkup(<ChordsLink href={`https://tabs.ultimate-guitar.com/"><img src=x onerror=alert(1)>`} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("renders nothing for a link that isn't http(s) or is markup", () => {
    expect(renderToStaticMarkup(<ChordsLink href="javascript:alert(1)" />)).toBe("");
    expect(renderToStaticMarkup(<ChordsLink href="data:text/html,<script>alert(1)</script>" />)).toBe("");
    expect(renderToStaticMarkup(<ChordsLink href={`"><img src=x onerror=alert(1)>`} />)).toBe("");
  });
});
