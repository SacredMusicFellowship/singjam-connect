import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/auth";
import { SONG_CULTURES as VALID_CULTURES, SONG_GENRES as VALID_GENRES, SONG_METERS as VALID_METERS, SONG_THEMES as VALID_THEMES, SONG_TONALITIES as VALID_TONALITIES } from "@singjam/core";

const SYSTEM_PROMPT = `You are a music research assistant helping to enrich a song database for SingJam, a platform for musicians.

Given the current data for a song, research and suggest corrections or additions for these fields:
- year_written: The year the song was composed/written (not recorded)
- first_line: The very first sung lyric line of the song (exclude section headers like [Verse 1])
- hook: The most recognisable lyric phrase, typically from the chorus
- composers: Full list of people who wrote the music
- lyricists: Full list of people who wrote the words (often identical to composers)
- primary_recording_year: Year of the most well-known or original recording
- tonality: The key mode of the song. Must be one of: ${VALID_TONALITIES.join(", ")}
- meter: The time signature numerator. Must be one of: ${VALID_METERS.join(", ")}
- vibe: Overall energy feel — must be "Banger", "Ballad", or null
- genres: Up to 3 genres. Must each be from: ${VALID_GENRES.join(", ")}
- themes: Up to 3 lyrical/emotional themes. Must each be from: ${VALID_THEMES.join(", ")}
- cultures: Cultural origins or associations (if any). Must each be from: ${VALID_CULTURES.join(", ")}
- music_culture: For traditional songs, the cultural tradition the melody comes from (e.g. "Irish", "Scottish"). Single value or null. Must be from the cultures list.
- lyric_culture: For traditional songs, the cultural tradition the lyrics come from. Often identical to music_culture but can differ. Single value or null. Must be from the cultures list.
- languages: Languages the song is sung in, as plain English names (e.g. "English", "French")
- notes: A concise factual paragraph about the song's history, origin, or cultural significance. Include disputed credits, notable recordings, or anything a musician would find useful. For traditional songs, include Roud Folk Song Index and Child Ballad numbers where known (e.g. "Roud 123" or "Child 10"). Null if nothing meaningful to add.
- productions: Movies, musicals, TV shows, or other productions this song originally appeared in or is strongly associated with. Return as an array of production names (e.g. "The Sound of Music", "Grease"), or an empty array if none.
- alternate_titles: Other titles the song is commonly known by (e.g. subtitle variants, translated titles, common misspellings). Do not repeat titles already in the current alternate_titles list.
- additional_recordings: Up to 2 other significant recordings of this song not already in the recording_artists list. Each entry must have "artist" (canonical artist name) and "year" (recording year — required; only omit if completely unverifiable). Focus on the most historically or culturally notable versions.

Rules:
- Only suggest values you are confident about. If unsure, return null for scalar fields or an empty array for lists.
- For first_line and hook, provide verbatim lyrics, not paraphrases.
- Use full canonical names for composers and lyricists (e.g. "Bob Dylan", not "Robert Zimmerman").
- For traditional or folk songs, use ["Traditional"] for both composers and lyricists.
- Return the full suggested list even if some names are already correct.
- Only use values from the provided lists for tonality, meter, vibe, genres, themes, and cultures. Do not invent new values.
- For genres specifically: choose the closest match from the list. Never invent a value outside it — return an empty array rather than approximate.
- Never use "British" for any culture field — use "English", "Scottish", "Welsh", or "Irish" as appropriate.
- Set confidence to "high" only when you are certain. Use "medium" or "low" otherwise.

Respond with valid JSON only, matching this exact schema:
{
  "year_written": number | null,
  "first_line": string | null,
  "hook": string | null,
  "composers": string[],
  "lyricists": string[],
  "primary_recording_year": number | null,
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
  "productions": string[],
  "alternate_titles": string[],
  "additional_recordings": { "artist": string, "year": number | null }[],
  "confidence": "high" | "medium" | "low"
}`;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { id: songId } = await params;

  const { data: song } = await supabase
    .from("songs")
    .select(`
      id, title, display_artist, year, year_written, slug, first_line, hook, notes,
      song_composers ( people ( name ) ),
      song_lyricists ( people ( name ) ),
      song_recording_artists ( year, position, artists ( name ) ),
      song_genres ( genres ( name ) ),
      song_themes ( themes ( name ) ),
      song_productions ( productions ( name ) ),
      song_cultures ( context, cultures ( name ) ),
      song_alternate_titles ( title )
    `)
    .eq("id", songId)
    .single();

  if (!song) return NextResponse.json({ error: "Song not found" }, { status: 404 });

  const composers = (song.song_composers as any[])?.map((c) => c.people?.name).filter(Boolean) ?? [];
  const lyricists = (song.song_lyricists as any[])?.map((l) => l.people?.name).filter(Boolean) ?? [];
  const recordings = ((song.song_recording_artists as any[]) ?? [])
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .map((r) => ({ artist: r.artists?.name, year: r.year }));
  const genres = (song.song_genres as any[])?.map((g) => g.genres?.name).filter(Boolean) ?? [];
  const themes = (song.song_themes as any[])?.map((t) => t.themes?.name).filter(Boolean) ?? [];
  const productions = (song.song_productions as any[])?.map((p) => p.productions?.name).filter(Boolean) ?? [];
  const musicCulture = (song.song_cultures as any[])?.find((x) => x.context === "music")?.cultures?.name ?? null;
  const lyricCulture = (song.song_cultures as any[])?.find((x) => x.context === "lyrics")?.cultures?.name ?? null;
  const alternateTitles = (song.song_alternate_titles as any[])?.map((t) => t.title).filter(Boolean) ?? [];

  const context = JSON.stringify({
    title: song.title,
    display_artist: song.display_artist,
    year_written: song.year_written,
    year: song.year,
    first_line: song.first_line,
    hook: song.hook,
    notes: song.notes,
    composers,
    lyricists,
    recording_artists: recordings,
    genres,
    themes,
    productions,
    music_culture: musicCulture,
    lyric_culture: lyricCulture,
    alternate_titles: alternateTitles,
  }, null, 2);

  const completion = await openai.chat.completions.create({
    model: "gpt-5.5",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Current song data:\n\n${context}\n\nPlease research this song and return your suggested values.` },
    ],
    response_format: { type: "json_object" },
    // gpt-5.5 only accepts the default temperature; low effort keeps a lookup near
    // 10s, well inside Netlify's 60s function limit (default effort took ~30s).
    reasoning_effort: "low",
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let suggestions;
  try {
    suggestions = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  return NextResponse.json({ suggestions });
}
