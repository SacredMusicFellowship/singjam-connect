import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireRole } from "@/lib/auth";
import { getSpotifyToken } from "@/lib/spotify";
import { SONG_CULTURES as VALID_CULTURES, SONG_GENRES as VALID_GENRES, SONG_METERS as VALID_METERS, SONG_THEMES as VALID_THEMES, SONG_TONALITIES as VALID_TONALITIES } from "@singjam/core";

const SYSTEM_PROMPT = `You are a music research assistant helping to build a song database for SingJam, a platform for musicians.

Given a song title and optional recording artist, research the song and return accurate data for these fields:
- title: The canonical title with correct casing and punctuation (may correct the input)
- display_artist: The most well-known recording artist's canonical name
- year_written: The year the song was composed/written (not first recorded)
- year: The year of the most well-known or original recording
- first_line: The very first sung lyric line (exclude section headers like [Verse 1])
- hook: The most recognisable lyric phrase, typically from the chorus
- composers: Full list of people who wrote the music
- lyricists: Full list of people who wrote the words (often identical to composers)
- recording_artists: All notable recordings, ordered by significance/fame. Each entry must have "artist" (canonical name) and "year" (recording year; only omit if completely unverifiable). Include at least the primary version and up to 4 others.
- tonality: The key mode. Must be one of: ${VALID_TONALITIES.join(", ")}
- meter: The time signature numerator. Must be one of: ${VALID_METERS.join(", ")}
- vibe: Overall energy — must be "Banger", "Ballad", or null
- genres: Up to 3 genres. Must each be from: ${VALID_GENRES.join(", ")}
- themes: Up to 3 lyrical/emotional themes. Must each be from: ${VALID_THEMES.join(", ")}
- cultures: Cultural origins or associations. Must each be from: ${VALID_CULTURES.join(", ")}
- music_culture: For traditional songs, the cultural tradition the melody comes from. Single value or null. Must be from the cultures list.
- lyric_culture: For traditional songs, the cultural tradition the lyrics come from. Single value or null. Must be from the cultures list.
- languages: Languages the song is sung in, as plain English names (e.g. "English", "French")
- notes: A concise factual paragraph about the song's history, origin, or cultural significance. Null if nothing meaningful to add.
- production: The show, film, or album the song originates from (e.g. "Hamilton", "The Lion King", "Abbey Road"). Null if not from a specific production. Single value only.
- alternate_titles: Other titles the song is commonly known by
- confidence: Your overall confidence in the data

Rules:
- Only suggest values you are confident about. Return null for uncertain scalar fields, empty arrays for uncertain lists.
- For first_line and hook, provide verbatim lyrics, not paraphrases.
- Use full canonical names (e.g. "Bob Dylan", not "Robert Zimmerman").
- For traditional or folk songs, use ["Traditional"] for both composers and lyricists.
- Only use values from the provided lists for tonality, meter, vibe, genres, themes, and cultures.
- For genres specifically: choose the closest match from the list. Never invent a value outside it — return an empty array rather than approximate.
- Never use "British" for culture — use "English", "Scottish", "Welsh", or "Irish" as appropriate.

Respond with valid JSON only:
{
  "title": string | null,
  "display_artist": string | null,
  "year_written": number | null,
  "year": number | null,
  "first_line": string | null,
  "hook": string | null,
  "composers": string[],
  "lyricists": string[],
  "recording_artists": { "artist": string, "year": number | null }[],
  "tonality": string | null,
  "meter": string | null,
  "vibe": "Banger" | "Ballad" | null,
  "genres": string[],
  "themes": string[],
  "cultures": string[],
  "music_culture": string | null,
  "lyric_culture": string | null,
  "languages": string[],
  "notes": string | null,
  "production": string | null,
  "alternate_titles": string[],
  "confidence": "high" | "medium" | "low"
}`;

async function lookupGeniusUrl(title: string, artist: string): Promise<string | null> {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) return null;
  const q = artist ? `${title} ${artist}` : title;
  try {
    const res = await fetch(
      `https://api.genius.com/search?q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.response?.hits?.[0]?.result?.url as string) ?? null;
  } catch { return null; }
}

async function searchSpotifyTrack(token: string, title: string, artist: string): Promise<string | null> {
  try {
    const q = `track:${title} artist:${artist}`;
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.tracks?.items?.[0]?.external_urls?.spotify as string) ?? null;
  } catch { return null; }
}

export async function POST(req: Request) {
  const auth = await requireRole("admin", "song_editor");
  if (!auth.ok) return auth.response;

  const { title, artist = "", production = "" } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // AI and Genius run in parallel — Genius doesn't depend on AI output
  const [completionResult, geniusResult] = await Promise.allSettled([
    openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Research this song and return accurate data.\n\nTitle: ${title.trim()}\nArtist: ${artist.trim() || "(unknown)"}${production.trim() ? `\nProduction: ${production.trim()}` : ""}` },
      ],
      response_format: { type: "json_object" },
      // gpt-5.5 only accepts the default temperature; low effort keeps a lookup near
      // 10s, well inside Netlify's 60s function limit (default effort took ~30s).
      reasoning_effort: "low",
    }),
    lookupGeniusUrl(title.trim(), artist.trim()),
  ]);

  if (completionResult.status === "rejected") {
    return NextResponse.json({ error: "AI lookup failed" }, { status: 500 });
  }

  let ai: Record<string, unknown>;
  try {
    ai = JSON.parse(completionResult.value.choices[0]?.message?.content ?? "{}");
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  // Search Spotify for each recording artist in parallel using a single token
  const aiArtists: { artist: string; year: number | null }[] = (ai.recording_artists as any[]) ?? [];
  const spotifyToken = await getSpotifyToken();
  const spotifyResults = spotifyToken
    ? await Promise.allSettled(aiArtists.map((ra) => searchSpotifyTrack(spotifyToken, title.trim(), ra.artist)))
    : [];

  const recordingArtists = aiArtists.map((ra, i) => ({
    artist: ra.artist,
    year: ra.year,
    spotify_url: spotifyResults[i]?.status === "fulfilled" ? (spotifyResults[i] as PromiseFulfilledResult<string | null>).value : null,
  }));

  return NextResponse.json({
    ai: { ...ai, recording_artists: recordingArtists },
    genius_url: geniusResult.status === "fulfilled" ? geniusResult.value : null,
  });
}
