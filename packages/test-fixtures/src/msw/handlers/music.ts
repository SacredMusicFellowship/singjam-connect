import { http, HttpResponse } from "msw";
import { recordCall } from "../calls";

// Song lookup and enrichment sources. Defaults return a single invented match (or nothing) so
// flows complete without touching the real services; tests override with server.use() when they
// need a particular answer.
const FAKE_TRACK = {
  id: "mocktrack0000000000001",
  name: "Lanterns Over the Harbor",
  artists: [{ id: "mockartist000000000001", name: "The Paper Moons" }],
  album: { name: "Harbor Lights", release_date: "1974-05-01", images: [] },
  external_urls: { spotify: "https://open.spotify.com/track/mocktrack0000000000001" },
  uri: "spotify:track:mocktrack0000000000001",
};

export const musicHandlers = [
  // Spotify
  http.post("https://accounts.spotify.com/api/token", async ({ request }) => {
    await recordCall("spotify", request);
    return HttpResponse.json({ access_token: "mock-spotify-token", token_type: "Bearer", expires_in: 3600 });
  }),
  http.get("https://api.spotify.com/v1/search", async ({ request }) => {
    await recordCall("spotify", request);
    return HttpResponse.json({ tracks: { items: [FAKE_TRACK], total: 1 } });
  }),
  http.get("https://api.spotify.com/v1/artists/:id", async ({ request, params }) => {
    await recordCall("spotify", request);
    return HttpResponse.json({ id: params.id, name: "The Paper Moons", genres: ["folk", "americana"] });
  }),
  http.get("https://api.spotify.com/v1/me", async ({ request }) => {
    await recordCall("spotify", request);
    return HttpResponse.json({ id: "mock-spotify-user", display_name: "SingJam Test" });
  }),
  http.post("https://api.spotify.com/v1/users/:userId/playlists", async ({ request }) => {
    await recordCall("spotify", request);
    return HttpResponse.json({ id: "mockplaylist000000000001", external_urls: { spotify: "https://open.spotify.com/playlist/mockplaylist000000000001" } });
  }),
  http.get("https://api.spotify.com/v1/playlists/:id/tracks", async ({ request }) => {
    await recordCall("spotify", request);
    return HttpResponse.json({ items: [], next: null, total: 0 });
  }),
  http.all("https://api.spotify.com/v1/playlists/:id/:sub?", async ({ request, params }) => {
    await recordCall("spotify", request);
    return HttpResponse.json({ id: params.id, snapshot_id: "mock-snapshot" });
  }),

  // Genius
  http.get("https://api.genius.com/search", async ({ request }) => {
    await recordCall("genius", request);
    return HttpResponse.json({ meta: { status: 200 }, response: { hits: [] } });
  }),

  // MusicBrainz: searches return nothing, lookups return a bare entity.
  http.get("https://musicbrainz.org/ws/2/:entity/:id?", async ({ request, params }) => {
    await recordCall("musicbrainz", request);
    const url = new URL(request.url);
    const entity = String(params.entity);
    if (url.searchParams.has("query") || url.searchParams.has("work")) {
      return HttpResponse.json({ count: 0, offset: 0, [`${entity}s`]: [] });
    }
    return HttpResponse.json({ id: params.id, title: "Lanterns Over the Harbor", relations: [], "artist-credit": [] });
  }),

  // Last.fm
  http.get("https://ws.audioscrobbler.com/2.0/", async ({ request }) => {
    await recordCall("lastfm", request);
    return HttpResponse.json({ toptags: { tag: [{ name: "folk", count: 100 }, { name: "singalong", count: 60 }] } });
  }),

  // SecondHandSongs
  http.get("https://secondhandsongs.com/search/work", async ({ request }) => {
    await recordCall("secondhandsongs", request);
    return HttpResponse.json({ resultPage: [] });
  }),

  // Wikidata
  http.get("https://query.wikidata.org/sparql", async ({ request }) => {
    await recordCall("wikidata", request);
    return HttpResponse.json({ head: { vars: [] }, results: { bindings: [] } });
  }),
];
