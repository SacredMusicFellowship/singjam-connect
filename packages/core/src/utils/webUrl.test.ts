import { describe, it, expect } from "vitest";
import { webUrl } from "./webUrl";

describe("webUrl", () => {
  it("keeps http and https addresses", () => {
    expect(webUrl(" https://www.ultimate-guitar.com/user/playlist/123 ")).toBe("https://www.ultimate-guitar.com/user/playlist/123");
    expect(webUrl("http://example.com")).toBe("http://example.com");
  });

  it("rejects script, data and malformed URLs", () => {
    expect(webUrl("javascript:alert(1)")).toBeNull();
    expect(webUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(webUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(webUrl("ultimate-guitar.com/playlist")).toBeNull();
    expect(webUrl("")).toBeNull();
    expect(webUrl(null)).toBeNull();
  });
});
