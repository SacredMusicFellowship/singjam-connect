import { describe, it, expect } from "vitest";
import { enrichmentInProgress } from "./enrichmentState";

const now = Date.parse("2026-11-05T10:00:00Z");
const ago = (s: number) => new Date(now - s * 1000).toISOString();

describe("enrichmentInProgress", () => {
  it("is filling in after the job starts and before it finishes", () => {
    expect(enrichmentInProgress({ enrichment_started_at: ago(10) }, now)).toBe(true);
  });
  it("is done once it finishes", () => {
    expect(enrichmentInProgress({ enrichment_started_at: ago(30), enrichment_finished_at: ago(5) }, now)).toBe(false);
  });
  it("counts a later re-run as filling in again", () => {
    expect(enrichmentInProgress({ enrichment_started_at: ago(5), enrichment_finished_at: ago(600) }, now)).toBe(true);
  });
  it("stops waiting after two minutes, and for songs never enriched", () => {
    expect(enrichmentInProgress({ enrichment_started_at: ago(180) }, now)).toBe(false);
    expect(enrichmentInProgress({}, now)).toBe(false);
  });
});
