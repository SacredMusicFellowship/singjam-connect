import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockAdminFrom } = vi.hoisted(() => ({
  mockAdminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom })),
}));

import { createNotification } from "./notifications";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "insert", "delete", "in"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

const NOTIF = {
  userId: "user-1",
  type: "jam_invite",
  title: "You're invited",
  body: "Ben invited you to Porch Jam",
  link: "/jam/jam-1",
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createNotification", () => {
  it("sends nothing under next dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      await createNotification(NOTIF);
      expect(mockAdminFrom).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("inserts the notification row", async () => {
    const insertChain = chain({});
    mockAdminFrom.mockReturnValueOnce(insertChain).mockReturnValueOnce(chain({ data: [] }));

    await createNotification(NOTIF);

    expect(mockAdminFrom).toHaveBeenCalledWith("notifications");
    expect(insertChain.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      type: "jam_invite",
      title: "You're invited",
      body: "Ben invited you to Porch Jam",
      link: "/jam/jam-1",
    });
  });

  it("skips push entirely when the user has no tokens", async () => {
    mockAdminFrom.mockReturnValueOnce(chain({})).mockReturnValueOnce(chain({ data: [] }));

    await createNotification(NOTIF);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one Expo push message per device token, with link in data", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({}))
      .mockReturnValueOnce(chain({ data: [{ token: "ExponentPushToken[a]" }, { token: "ExponentPushToken[b]" }] }));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: "ok" }, { status: "ok" }] }),
    });

    await createNotification(NOTIF);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    const messages = JSON.parse(init.body);
    expect(messages).toEqual([
      {
        to: "ExponentPushToken[a]",
        title: "You're invited",
        body: "Ben invited you to Porch Jam",
        data: { link: "/jam/jam-1" },
        sound: "default",
      },
      {
        to: "ExponentPushToken[b]",
        title: "You're invited",
        body: "Ben invited you to Porch Jam",
        data: { link: "/jam/jam-1" },
        sound: "default",
      },
    ]);
  });

  it("omits body and data when not provided", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({}))
      .mockReturnValueOnce(chain({ data: [{ token: "ExponentPushToken[a]" }] }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: "ok" }] }) });

    await createNotification({ userId: "user-1", type: "generic", title: "Hello" });

    const messages = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(messages).toEqual([{ to: "ExponentPushToken[a]", title: "Hello", sound: "default" }]);
  });

  it("deletes tokens Expo reports as DeviceNotRegistered", async () => {
    const deleteChain = chain({});
    mockAdminFrom
      .mockReturnValueOnce(chain({}))
      .mockReturnValueOnce(chain({ data: [{ token: "ExponentPushToken[dead]" }, { token: "ExponentPushToken[live]" }] }))
      .mockReturnValueOnce(deleteChain);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { status: "error", details: { error: "DeviceNotRegistered" } },
          { status: "ok" },
        ],
      }),
    });

    await createNotification(NOTIF);

    expect(deleteChain.delete).toHaveBeenCalled();
    expect(deleteChain.in).toHaveBeenCalledWith("token", ["ExponentPushToken[dead]"]);
  });

  it("does not throw when the push request fails", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({}))
      .mockReturnValueOnce(chain({ data: [{ token: "ExponentPushToken[a]" }] }));
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(createNotification(NOTIF)).resolves.toBeUndefined();
  });

  it("does not throw when Expo returns a non-OK response", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({}))
      .mockReturnValueOnce(chain({ data: [{ token: "ExponentPushToken[a]" }] }));
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

    await expect(createNotification(NOTIF)).resolves.toBeUndefined();
  });
});
