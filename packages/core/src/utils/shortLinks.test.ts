import { describe, it, expect } from "vitest";
import { jamPath, setPath } from "./shortLinks";

describe("jamPath / setPath", () => {
  it("uses the short code when there is one", () => {
    expect(jamPath({ id: "uuid-1", short_code: "9ur49hzp" })).toBe("/jam/9ur49hzp");
    expect(setPath({ id: "uuid-2", short_code: "35exb45g" })).toBe("/set/35exb45g");
  });

  it("falls back to the uuid, which the pages still accept", () => {
    expect(jamPath({ id: "uuid-1" })).toBe("/jam/uuid-1");
    expect(setPath({ id: "uuid-2", short_code: null })).toBe("/set/uuid-2");
  });
});
