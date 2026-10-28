import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

// The client is memoised, so each test imports a fresh module.
async function freshStripe() {
  return (await import("./stripe")).stripe();
}

describe("stripe client under next dev", () => {
  it("refuses a mutating call without reaching Stripe", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "");
    vi.stubEnv("STRIPE_RESTRICTED_KEY", "rk_test_dummy");
    vi.stubGlobal("fetch", vi.fn());

    await expect((await freshStripe()).coupons.create({ percent_off: 100 })).rejects.toThrow(
      "Stripe calls are disabled in local development"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still lets reads through", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STRIPE_RESTRICTED_KEY", "rk_test_dummy");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "co_1", object: "coupon" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
    );

    const coupon = await (await freshStripe()).coupons.retrieve("co_1");
    expect(coupon.id).toBe("co_1");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
