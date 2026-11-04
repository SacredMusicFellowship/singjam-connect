import { describe, it, expect } from "vitest";
import { canContributeToSet, canManageSet, setsAcceptingSongs } from "./setRoles";

describe("canContributeToSet", () => {
  it("allows editors and co-owners", () => {
    expect(canContributeToSet("editor")).toBe(true);
    expect(canContributeToSet("co-owner")).toBe(true);
  });

  it("refuses viewers", () => {
    expect(canContributeToSet("viewer")).toBe(false);
  });

  it("treats a missing role as an owned set", () => {
    expect(canContributeToSet(null)).toBe(true);
    expect(canContributeToSet(undefined)).toBe(true);
  });

  it("refuses an unrecognised role rather than defaulting open", () => {
    expect(canContributeToSet("")).toBe(false);
    expect(canContributeToSet("Editor")).toBe(false);
    expect(canContributeToSet("admin")).toBe(false);
  });
});

describe("setsAcceptingSongs", () => {
  it("keeps owned sets and drops the ones the user only views", () => {
    const sets = [
      { id: "owned" },
      { id: "editing", role: "editor" },
      { id: "co-owning", role: "co-owner" },
      { id: "viewing", role: "viewer" },
    ];
    expect(setsAcceptingSongs(sets).map((s) => s.id)).toEqual(["owned", "editing", "co-owning"]);
  });

  it("returns an empty list rather than throwing on no input", () => {
    expect(setsAcceptingSongs([])).toEqual([]);
  });
});

describe("canManageSet", () => {
  it("lets the owner and co-owners manage", () => {
    expect(canManageSet(true, undefined)).toBe(true);
    expect(canManageSet(false, "co-owner")).toBe(true);
  });

  it("keeps editors and viewers out, since event guests join as editors", () => {
    expect(canManageSet(false, "editor")).toBe(false);
    expect(canManageSet(false, "viewer")).toBe(false);
    expect(canManageSet(false, null)).toBe(false);
  });
});
