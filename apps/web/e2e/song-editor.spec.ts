import { randomUUID } from "node:crypto";
import { authFile, expect, test } from "./fixtures";
import { hydrated, openPage } from "./support/signIn";
import { admin } from "./support/supabase";

test.use({ storageState: authFile("editor") });

test("the song editor shows where automatic notes came from until someone edits them", async ({ page }) => {
  const { data: song, error } = await admin
    .from("songs")
    .insert({ title: `Notes Source Check ${randomUUID().slice(0, 8)}`, notes: "Written for a harbour festival.", notes_source: "ai" })
    .select("id")
    .single();
  if (error || !song) throw error;
  try {
    await openPage(page, `/song-editor/songs/${song.id}`);
    await expect(page.getByText("AI-written · not checked")).toBeVisible();

    const notes = await hydrated(page.getByPlaceholder("Any extra context, performance notes, etc."));
    await notes.fill("Checked and rewritten by an editor.");
    await expect(page.getByText("AI-written · not checked")).toBeHidden();
  } finally {
    await admin.from("songs").delete().eq("id", song.id);
  }
});

test("a review's text, tune and notes are applied, and the notes keep their source when saved", async ({ page }) => {
  const stamp = Date.now();
  const textTitle = `Harbour Carol ${stamp}`;
  const tuneName = `Harbour Light ${stamp}`;
  const notes = "A carol first sung at a harbour festival.";
  const now = new Date().toISOString();
  const empty = { year_written: null, first_line: null, hook: null, composers: [], lyricists: [], primary_recording_year: null, tonality: null, meter: null,
    vibe: null, genres: [], themes: [], cultures: [], forms: [], occasions: [], communities: [], music_culture: null, lyric_culture: null, languages: [],
    productions: [], alternate_titles: [], additional_recordings: [], genius_url: null };
  const { data: song, error } = await admin
    .from("songs")
    .insert({
      title: textTitle,
      enrichment_proposal: {
        requested_at: now, finished_at: now, agreed: ["notes", "text", "tune"], fromWikipedia: [], wikipedia: null, checks: [],
        suggestions: { ...empty, notes, text: { title: textTitle, first_line: "Lights along the harbour", authors: [], url: "https://hymnary.org/text/x" }, tune: { name: tuneName, composers: [] } },
      },
    })
    .select("id")
    .single();
  if (error || !song) throw error;
  try {
    await openPage(page, `/song-editor/songs/${song.id}`);
    await page.getByRole("button", { name: "Apply 3 suggestions" }).click();
    await expect(page.getByText("AI-written · not checked")).toBeVisible();
    await expect(page.getByText("Linked. Save the song to keep it.")).toHaveCount(2);

    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect.poll(async () => {
      const { data } = await admin.from("songs").select("notes, notes_source, texts(title, first_line, kind), tunes(name)").eq("id", song.id).single();
      return data;
    }).toEqual({ notes, notes_source: "ai", texts: { title: textTitle, first_line: "Lights along the harbour", kind: "hymn" }, tunes: { name: tuneName } });
  } finally {
    const { data } = await admin.from("songs").select("text_id, tune_id").eq("id", song.id).single();
    await admin.from("songs").delete().eq("id", song.id);
    if (data?.text_id) await admin.from("texts").delete().eq("id", data.text_id);
    if (data?.tune_id) await admin.from("tunes").delete().eq("id", data.tune_id);
  }
});
