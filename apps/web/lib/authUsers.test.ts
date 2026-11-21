import { describe, it, expect, vi } from "vitest";
import { fetchAllAuthEmails, fetchAllAuthUsers, findAuthUserByEmail } from "./authUsers";

function pagedAdmin(pages: { id: string; email?: string | null }[][]) {
  return {
    listUsers: vi.fn(async ({ page }: { page: number; perPage: number }) => ({
      data: { users: pages[page - 1] ?? [] },
      error: null,
    })),
  };
}

describe("fetchAllAuthEmails", () => {
  it("maps ids to email addresses", async () => {
    const admin = pagedAdmin([[{ id: "a", email: "a@example.com" }, { id: "b", email: "b@example.com" }]]);
    const emails = await fetchAllAuthEmails(admin, 2);
    expect([...emails]).toEqual([
      ["a", "a@example.com"],
      ["b", "b@example.com"],
    ]);
  });

  it("keeps paging while a page comes back full", async () => {
    const admin = pagedAdmin([
      [{ id: "a", email: "a@example.com" }, { id: "b", email: "b@example.com" }],
      [{ id: "c", email: "c@example.com" }],
    ]);
    const emails = await fetchAllAuthEmails(admin, 2);
    expect(emails.size).toBe(3);
    expect(emails.get("c")).toBe("c@example.com");
    expect(admin.listUsers).toHaveBeenCalledTimes(2);
  });

  it("stops after a short page instead of asking for another", async () => {
    const admin = pagedAdmin([[{ id: "a", email: "a@example.com" }]]);
    await fetchAllAuthEmails(admin, 2);
    expect(admin.listUsers).toHaveBeenCalledTimes(1);
  });

  it("skips users with no address rather than storing a blank", async () => {
    const admin = pagedAdmin([[{ id: "a", email: null }, { id: "b" }, { id: "c", email: "c@example.com" }]]);
    const emails = await fetchAllAuthEmails(admin, 3);
    expect([...emails.keys()]).toEqual(["c"]);
  });

  it("throws instead of returning a partial map when a page fails", async () => {
    const admin = {
      listUsers: vi.fn(async () => ({ data: { users: [] }, error: { message: "boom" } })),
    };
    await expect(fetchAllAuthEmails(admin, 2)).rejects.toThrow("boom");
  });
});

describe("fetchAllAuthUsers", () => {
  it("returns every page's users in order", async () => {
    const admin = pagedAdmin([
      [{ id: "a" }, { id: "b" }],
      [{ id: "c" }],
    ]);
    expect(await fetchAllAuthUsers(admin, 2)).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(admin.listUsers).toHaveBeenCalledTimes(2);
    expect(admin.listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 2 });
  });

  it("throws instead of returning a partial list when a page fails", async () => {
    const admin = {
      listUsers: vi
        .fn()
        .mockResolvedValueOnce({ data: { users: [{ id: "a" }, { id: "b" }] }, error: null })
        .mockResolvedValueOnce({ data: { users: [] }, error: { message: "boom" } }),
    };
    await expect(fetchAllAuthUsers(admin, 2)).rejects.toThrow("boom");
  });
});

describe("findAuthUserByEmail", () => {
  // A bare listUsers() stops at 50 users, so members past the first page were
  // treated as strangers and sent a sign-up invite instead of an in-app one.
  it("finds a user beyond the first page, ignoring case and whitespace", async () => {
    const admin = pagedAdmin([
      [{ id: "a", email: "a@x.com" }, { id: "b", email: "b@x.com" }],
      [{ id: "c", email: "Joel@X.com" }],
    ]);
    expect(await findAuthUserByEmail(admin, " joel@x.com ", 2)).toEqual({ id: "c", email: "Joel@X.com" });
  });

  it("returns null when nobody has the address", async () => {
    const admin = pagedAdmin([[{ id: "a", email: "a@x.com" }]]);
    expect(await findAuthUserByEmail(admin, "nobody@x.com", 2)).toBeNull();
  });
});
