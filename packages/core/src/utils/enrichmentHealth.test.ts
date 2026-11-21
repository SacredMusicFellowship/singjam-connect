import { describe, expect, it } from "vitest";
import { newOutages, sourceFailures, type RunChecks } from "./enrichmentHealth";

const run = (claude: boolean, gpt = true): RunChecks => [{ name: "GPT", ok: gpt }, { name: "Claude", ok: claude }];

describe("newOutages", () => {
  it("reports a model once, on the fifth failed run in a row", () => {
    expect(newOutages([run(false), run(false), run(false), run(false), run(false), run(true)])).toEqual(["Claude"]);
  });
  it("stays quiet before the streak and after it has been reported", () => {
    expect(newOutages([run(false), run(false), run(false), run(false), run(true)])).toEqual([]);
    expect(newOutages([run(false), run(false), run(false), run(false), run(false), run(false)])).toEqual([]);
  });
  it("counts runs recorded before checks were kept as answered", () => {
    expect(newOutages([run(false, false), run(false, false), run(false, false), run(false, false), run(false, false), null])).toEqual(["GPT", "Claude"]);
  });
});

describe("sourceFailures", () => {
  it("counts each model's failed runs", () => {
    expect(sourceFailures([run(false), run(false), run(true), null])).toEqual([{ name: "Claude", failed: 2 }]);
  });
});
