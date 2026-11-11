import { describe, expect, it } from "vitest";
import { popoverSide } from "./popoverSide";

describe("popoverSide", () => {
  it("opens down when the menu fits below the button", () => {
    expect(popoverSide({ top: 100, bottom: 130 }, 900, 70, 270)).toBe("down");
  });
  it("opens up near the bottom of the screen", () => {
    expect(popoverSide({ top: 760, bottom: 790 }, 900, 70, 270)).toBe("up");
  });
  it("counts the sticky header against the room above", () => {
    expect(popoverSide({ top: 300, bottom: 330 }, 500, 200, 270)).toBe("down");
  });
  it("opens down when neither side fits but below has more room", () => {
    expect(popoverSide({ top: 150, bottom: 180 }, 400, 0, 270)).toBe("down");
  });
});
