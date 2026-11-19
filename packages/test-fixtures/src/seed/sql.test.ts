import { describe, expect, it } from "vitest";
import { insert, jsonb, literal, raw, relativeTimestamp, textArray, uuidArray } from "./sql";

describe("literal", () => {
  it("escapes single quotes", () => {
    expect(literal("Shanty Night's best")).toBe("'Shanty Night''s best'");
  });

  it("writes null, numbers, booleans and raw SQL as-is", () => {
    expect([literal(null), literal(15), literal(false), literal(raw("now()"))]).toEqual(["null", "15", "false", "now()"]);
  });

  it("refuses values SQL can't hold", () => {
    expect(() => literal(Number.NaN)).toThrow();
  });
});

describe("arrays and json", () => {
  it("types empty arrays so Postgres accepts them", () => {
    expect(literal(textArray([]))).toBe("'{}'::text[]");
    expect(literal(uuidArray([]))).toBe("'{}'::uuid[]");
  });

  it("escapes values inside arrays and json", () => {
    expect(literal(textArray(["R&B", "Children's"]))).toBe("array['R&B', 'Children''s']::text[]");
    expect(literal(jsonb({ note: "it's" }))).toBe(`'{"note":"it''s"}'::jsonb`);
  });
});

describe("relativeTimestamp", () => {
  const anchor = new Date("2026-06-01T19:00:00Z");

  it("writes times as an offset from now()", () => {
    expect(literal(relativeTimestamp("2026-06-02T19:00:00Z", anchor))).toBe("now() + interval '86400 seconds'");
    expect(literal(relativeTimestamp("2026-05-31T19:00:00Z", anchor))).toBe("now() - interval '86400 seconds'");
    expect(literal(relativeTimestamp("2026-06-01T19:00:00Z", anchor))).toBe("now()");
    expect(relativeTimestamp(null, anchor)).toBeNull();
  });
});

describe("insert", () => {
  it("rejects rows with different columns", () => {
    expect(() => insert("t", [{ a: 1 }, { b: 2 }])).toThrow();
  });

  it("writes one multi-row insert", () => {
    expect(insert("public.t", [{ a: 1, b: "x" }, { a: 2, b: null }])).toBe("insert into public.t (a, b) values\n  (1, 'x'),\n  (2, null);\n");
  });
});
