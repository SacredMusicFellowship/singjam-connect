import { http, HttpResponse } from "msw";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { installMockServer, isLocalRequest, mockCalls, mockServer } from "./node";

installMockServer({ afterEach, afterAll });

const json = async (input: string, init?: RequestInit) => (await fetch(input, init)).json();
const post = (body: unknown, type = "application/json") => ({
  method: "POST",
  headers: { "content-type": type },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

describe("Stripe", () => {
  it("creates an Elements checkout session with a client secret, keeping metadata", async () => {
    const session = await json(
      "https://api.stripe.com/v1/checkout/sessions",
      post("ui_mode=elements&currency=usd&metadata[order_id]=abc", "application/x-www-form-urlencoded"),
    );
    expect(session).toMatchObject({ object: "checkout.session", ui_mode: "elements", metadata: { order_id: "abc" } });
    expect(session.client_secret).toMatch(/^cs_test_mock_\d+_secret_mock$/);
    expect(mockCalls("stripe")).toHaveLength(1);
  });

  it("returns a paid session and a payment intent with its fee", async () => {
    expect(await json("https://api.stripe.com/v1/checkout/sessions/cs_x")).toMatchObject({ id: "cs_x", payment_status: "paid" });
    const intent = await json("https://api.stripe.com/v1/payment_intents/pi_x?expand[]=latest_charge.balance_transaction");
    expect(intent.latest_charge.balance_transaction.fee).toBe(74);
  });

  it("manages coupons and promotion codes", async () => {
    const coupon = await json("https://api.stripe.com/v1/coupons", post("percent_off=20&duration=once", "application/x-www-form-urlencoded"));
    expect(coupon.percent_off).toBe(20);
    expect(await json(`https://api.stripe.com/v1/coupons/${coupon.id}`, { method: "DELETE" })).toMatchObject({ deleted: true });
    const promo = await json("https://api.stripe.com/v1/promotion_codes", post(`coupon=${coupon.id}&code=SING20`, "application/x-www-form-urlencoded"));
    expect(promo).toMatchObject({ code: "SING20", active: true });
  });
});

describe("messaging", () => {
  it("accepts single and batch emails without sending anything", async () => {
    expect((await json("https://api.resend.com/emails", post({ to: "member@singjam.test" }))).id).toMatch(/^email_mock_/);
    expect((await json("https://api.resend.com/emails/batch", post([{}, {}]))).data).toHaveLength(2);
    expect(mockCalls("resend")).toHaveLength(2);
  });

  it("answers ActiveCampaign on any account host", async () => {
    const synced = await json("https://singjam.api-us1.com/api/3/contact/sync", post({ contact: { email: "member@singjam.test" } }));
    expect(synced.contact.id).toBe("1001");
    expect(mockCalls("activecampaign")[0].body).toContain("member@singjam.test");
  });

  it("acknowledges every Expo push message", async () => {
    const res = await json("https://exp.host/--/api/v2/push/send", post([{ to: "ExponentPushToken[a]" }, { to: "ExponentPushToken[b]" }]));
    expect(res.data.map((t: { status: string }) => t.status)).toEqual(["ok", "ok"]);
  });
});

describe("music sources", () => {
  it("returns an invented Spotify match after the token exchange", async () => {
    expect((await json("https://accounts.spotify.com/api/token", post("grant_type=client_credentials", "application/x-www-form-urlencoded"))).access_token).toBeTruthy();
    const search = await json("https://api.spotify.com/v1/search?q=lanterns&type=track&limit=1");
    expect(search.tracks.items[0]).toMatchObject({ name: "Lanterns Over the Harbor", artists: [{ name: "The Paper Moons" }] });
  });

  it("returns empty search results from the enrichment sources", async () => {
    expect((await json("https://musicbrainz.org/ws/2/recording/?query=x&fmt=json")).recordings).toEqual([]);
    expect((await json("https://musicbrainz.org/ws/2/work/?query=x&fmt=json")).works).toEqual([]);
    expect((await json("https://musicbrainz.org/ws/2/recording/abc?inc=artist-credits&fmt=json")).id).toBe("abc");
    expect((await json("https://api.genius.com/search?q=x")).response.hits).toEqual([]);
    expect((await json("https://secondhandsongs.com/search/work?title=x&performer=y")).resultPage).toEqual([]);
    expect((await json("https://query.wikidata.org/sparql?query=x&format=json")).results.bindings).toEqual([]);
    expect((await json("https://ws.audioscrobbler.com/2.0/?method=track.gettoptags&format=json")).toptags.tag[0].name).toBe("folk");
  });
});

describe("Google", () => {
  it("suggests the fixtures' invented venues", async () => {
    const res = await json("https://places.googleapis.com/v1/places:autocomplete", post({ input: "lantern" }));
    expect(res.suggestions[0].placePrediction.structuredFormat.mainText.text).toBe("The Lantern Room");
    const place = await json(`https://places.googleapis.com/v1/places/${res.suggestions[0].placePrediction.placeId}`);
    expect(place.formattedAddress).toContain("Lantern Lane");
    const search = await json("https://places.googleapis.com/v1/places:searchText", post({ textQuery: "x" }));
    expect(search.places[0].timeZone.id).toBe("America/Los_Angeles");
  });

  it("supports the YouTube playlist export", async () => {
    expect((await json("https://oauth2.googleapis.com/token", post("grant_type=refresh_token", "application/x-www-form-urlencoded"))).access_token).toBeTruthy();
    expect((await json("https://www.googleapis.com/youtube/v3/search?q=x")).items[0].id.videoId).toBe("mockvideo01");
    expect((await json("https://www.googleapis.com/youtube/v3/playlists", post({}))).id).toBe("PLmockplaylist0001");
  });
});

describe("OpenAI", () => {
  it("answers chat completions with an empty JSON object", async () => {
    const res = await json("https://api.openai.com/v1/chat/completions", post({ model: "gpt-x", messages: [] }));
    expect(JSON.parse(res.choices[0].message.content)).toEqual({});
  });
});

describe("safety net", () => {
  it("blocks any outside request without a handler", async () => {
    // MSW turns the thrown error into a 500 and prints it, so the test's code sees a failure and
    // the request never leaves the machine.
    const res = await fetch("https://api.example.org/anything");
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("Unmocked outside request: GET https://api.example.org/anything");
  });

  it("lets local services through", () => {
    expect(isLocalRequest("http://127.0.0.1:54321/rest/v1/jams")).toBe(true);
    expect(isLocalRequest("http://localhost:3000/")).toBe(true);
    expect(isLocalRequest("https://api.stripe.com/v1")).toBe(false);
  });

  it("lets a test override a handler, then restores the default", async () => {
    mockServer.use(http.get("https://api.genius.com/search", () => HttpResponse.json({ response: { hits: [{ id: 1 }] } })));
    expect((await json("https://api.genius.com/search?q=x")).response.hits).toHaveLength(1);
    mockServer.resetHandlers();
    expect((await json("https://api.genius.com/search?q=x")).response.hits).toHaveLength(0);
  });
});
