import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChordsLink from "./ChordsLink";
import { getYoutubeId } from "./setDetailShared";

describe("ChordsLink", () => {
  it("links to a web address", () => {
    const html = renderToStaticMarkup(<ChordsLink href="https://tabs.ultimate-guitar.com/tab/x" />);
    expect(html).toContain('href="https://tabs.ultimate-guitar.com/tab/x"');
  });

  it("shows nothing for a script or data URL", () => {
    expect(renderToStaticMarkup(<ChordsLink href="javascript:alert(1)" />)).toBe("");
    expect(renderToStaticMarkup(<ChordsLink href=" JavaScript:alert(1)" />)).toBe("");
    expect(renderToStaticMarkup(<ChordsLink href="data:text/html,<b>x</b>" />)).toBe("");
  });
});

describe("getYoutubeId", () => {
  it("reads YouTube links", () => {
    expect(getYoutubeId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
    expect(getYoutubeId("https://m.youtube.com/shorts/xyz")).toBe("xyz");
    expect(getYoutubeId("https://youtube.com/embed/def")).toBe("def");
    expect(getYoutubeId("https://youtu.be/ghi?t=3")).toBe("ghi");
  });

  it("ignores other hosts that only contain youtube.com", () => {
    expect(getYoutubeId("https://youtube.com.evil.example/watch?v=abc")).toBeNull();
    expect(getYoutubeId("https://notyoutube.com/watch?v=abc")).toBeNull();
    expect(getYoutubeId("https://evil.example/?u=youtube.com&v=abc")).toBeNull();
  });
});
