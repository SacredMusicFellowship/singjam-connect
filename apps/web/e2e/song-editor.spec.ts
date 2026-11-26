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

test("the recording artist picker offers the artist a misspelling means before creating a new one", async ({ page }) => {
  const { data: song, error } = await admin.from("songs").insert({ title: `Picker Check ${randomUUID().slice(0, 8)}` }).select("id").single();
  if (error || !song) throw error;
  try {
    await openPage(page, `/song-editor/songs/${song.id}`);
    const search = await hydrated(page.getByPlaceholder("Search recording artists…"));
    await search.fill("Delphine Arowood");
    const options = page.locator("li button");
    await expect(options.first()).toHaveText("Delphine Arrowood");
    await expect(page.getByRole("button", { name: /Create "Delphine Arowood"/ })).toBeVisible();
  } finally {
    await admin.from("songs").delete().eq("id", song.id);
  }
});

test("a song editor links a score from an allowed site, and the song shows it in place of chords", async ({ page }) => {
  const { data: song, error } = await admin.from("songs").insert({ title: `Score Check ${randomUUID().slice(0, 8)}` }).select("id, slug").single();
  if (error || !song) throw error;
  try {
    await openPage(page, `/song-editor/songs/${song.id}`);
    const score = await hydrated(page.getByPlaceholder(/dilbeyti\.com/));
    const save = page.getByRole("button", { name: "Save", exact: true }).first();

    await score.fill("https://drive.google.com/file/d/abc/view");
    await save.click();
    await expect(page.getByText("Score links need to be a Dil Beyti, Hymnary, IMSLP, CPDL or MuseScore page, or a PDF.")).toBeVisible();

    await score.fill("https://dilbeyti.com/en/besteler/690");
    await page.getByPlaceholder("A translation of the words elsewhere").fill("https://example.org/translations/bakip-cemal");
    await save.click();
    await expect.poll(async () => {
      const { data } = await admin.from("songs").select("score_url, translation_url").eq("id", song.id).single();
      return data;
    }).toEqual({ score_url: "https://dilbeyti.com/en/besteler/690", translation_url: "https://example.org/translations/bakip-cemal" });

    await openPage(page, `/songs/${song.slug}`);
    await expect(page.getByRole("link", { name: "Score" }).first()).toHaveAttribute("href", "https://dilbeyti.com/en/besteler/690");
    await expect(page.getByRole("link", { name: "Dil Beyti ↗" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Translation" })).toHaveAttribute("href", "https://example.org/translations/bakip-cemal");
  } finally {
    await admin.from("songs").delete().eq("id", song.id);
  }
});

test("a song editor sets a song's maqam and usul, one of each", async ({ page }) => {
  const { data: song, error } = await admin.from("songs").insert({ title: `Maqam Check ${randomUUID().slice(0, 8)}` }).select("id").single();
  if (error || !song) throw error;
  try {
    await openPage(page, `/song-editor/songs/${song.id}`);
    const maqam = await hydrated(page.getByPlaceholder("Search maqams, ragas, modes…"));
    await maqam.fill("Hica");
    await page.getByRole("button", { name: "Hicaz", exact: true }).click();
    await maqam.fill("Ras");
    await page.getByRole("button", { name: "Rast", exact: true }).click();
    const usul = page.getByPlaceholder("Search usuls and rhythms…");
    await usul.fill("Düy");
    await page.getByRole("button", { name: "Düyek", exact: true }).click();

    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect.poll(async () => {
      const { data } = await admin.from("song_tags").select("tags(name, type)").eq("song_id", song.id);
      return (data ?? []).map((r: any) => `${r.tags.type}:${r.tags.name}`).sort();
    }).toEqual(["mode:Rast", "rhythm:Düyek"]);
  } finally {
    await admin.from("songs").delete().eq("id", song.id);
  }
});
