import { http, HttpResponse } from "msw";
import { VENUES } from "../../names";
import { recordCall } from "../calls";

const PLACES = "https://places.googleapis.com/v1";

// Invented venues from the fixtures, so address pickers show the same fake places as the seed.
const places = VENUES.map((venue, i) => ({
  id: `mock-place-${i + 1}`,
  formattedAddress: venue.address,
  displayName: { text: venue.name },
  location: { latitude: 34.05 + i / 100, longitude: -118.25 - i / 100 },
  timeZone: { id: "America/Los_Angeles" },
  utcOffsetMinutes: -420,
}));

export const googleHandlers = [
  // Places (New)
  http.post(/^https:\/\/places\.googleapis\.com\/v1\/places:autocomplete$/, async ({ request }) => {
    await recordCall("google-places", request);
    return HttpResponse.json({
      suggestions: places.map((p) => ({
        placePrediction: {
          placeId: p.id,
          text: { text: p.formattedAddress },
          structuredFormat: {
            mainText: { text: p.displayName.text },
            secondaryText: { text: p.formattedAddress },
          },
        },
      })),
    });
  }),
  http.post(/^https:\/\/places\.googleapis\.com\/v1\/places:searchText$/, async ({ request }) => {
    await recordCall("google-places", request);
    return HttpResponse.json({ places: places.slice(0, 1) });
  }),
  http.get(`${PLACES}/places/:id`, async ({ request, params }) => {
    await recordCall("google-places", request);
    return HttpResponse.json(places.find((p) => p.id === params.id) ?? places[0]);
  }),

  // YouTube Data API and the OAuth token exchange the playlist export uses
  http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
    await recordCall("google-oauth", request);
    return HttpResponse.json({ access_token: "mock-google-token", token_type: "Bearer", expires_in: 3600 });
  }),
  http.get("https://www.googleapis.com/youtube/v3/search", async ({ request }) => {
    await recordCall("youtube", request);
    return HttpResponse.json({ items: [{ id: { kind: "youtube#video", videoId: "mockvideo01" }, snippet: { title: "Lanterns Over the Harbor (live)" } }] });
  }),
  http.post("https://www.googleapis.com/youtube/v3/playlists", async ({ request }) => {
    await recordCall("youtube", request);
    return HttpResponse.json({ id: "PLmockplaylist0001", kind: "youtube#playlist" });
  }),
  http.get("https://www.googleapis.com/youtube/v3/playlistItems", async ({ request }) => {
    await recordCall("youtube", request);
    return HttpResponse.json({ items: [], pageInfo: { totalResults: 0 } });
  }),
  http.post("https://www.googleapis.com/youtube/v3/playlistItems", async ({ request }) => {
    await recordCall("youtube", request);
    return HttpResponse.json({ id: "mockplaylistitem01", kind: "youtube#playlistItem" });
  }),
  http.delete("https://www.googleapis.com/youtube/v3/playlistItems", async ({ request }) => {
    await recordCall("youtube", request);
    return new HttpResponse(null, { status: 204 });
  }),
];
