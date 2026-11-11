import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => ({}) }));

import { firstLoadPages } from "./useBrowseSongs";

describe("firstLoadPages", () => {
  it("asks for a normal first page in one request", () => {
    expect(firstLoadPages(20)).toEqual([{ offset: 0, limit: 20 }]);
    expect(firstLoadPages(200)).toEqual([{ offset: 0, limit: 200 }]);
  });

  it("splits a deep return visit into 200-row pages with no gaps or overlaps", () => {
    const pages = firstLoadPages(537);
    expect(pages).toEqual([
      { offset: 0, limit: 200 },
      { offset: 200, limit: 200 },
      { offset: 400, limit: 137 },
    ]);
    expect(pages.reduce((n, p) => n + p.limit, 0)).toBe(537);
  });
});
