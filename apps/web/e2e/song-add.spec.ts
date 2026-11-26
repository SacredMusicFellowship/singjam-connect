import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { openPage } from "./support/signIn";
import { admin } from "./support/supabase";

// WebKit on CI can lose the first click while /search is still settling, so
// click until the form opens.
async function openAddForm(page: Page, path = "/search") {
  await openPage(page, path);
  const title = page.getByPlaceholder("e.g. Proud Mary");
  await expect(async () => {
    if (!(await title.isVisible())) await page.getByRole("button", { name: "Add a missing song" }).click();
    await expect(title).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test("what a member searched for fills in the missing song's title", async ({ page, freshMember }) => {
  const searched = `harbour lullaby ${freshMember.id.slice(0, 8)}`;
  await openAddForm(page, `/search?q=${encodeURIComponent(searched)}`);
  await expect(page.getByPlaceholder("e.g. Proud Mary")).toHaveValue(searched);
});

test("a member adds a missing song and says how they know it and how it starts", async ({ page, freshMember }) => {
  const title = `Harbour Carol ${freshMember.id.slice(0, 8)}`;
  try {
    await openAddForm(page);
    await page.getByPlaceholder("e.g. Proud Mary").fill(title);
    await page.getByRole("button", { name: "Look up" }).click();

    await expect(page.getByText("Is this the song?")).toBeVisible();
    const hymn = page.getByRole("button", { name: "Hymn, carol or worship" });
    await hymn.click();
    await expect(hymn).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("How does it start?").fill("Lights along the harbour, shining through the night");
    await page.getByRole("button", { name: "Yes, that's the song — add it" }).click();

    await expect(page).toHaveURL(/\/songs\//);
    const { data } = await admin.from("songs").select("add_hints, first_line").eq("title", title).single();
    expect(data).toEqual({
      add_hints: { known_as: "hymn", first_line: "Lights along the harbour, shining through the night" },
      first_line: null,
    });
  } finally {
    await admin.from("songs").delete().eq("title", title);
  }
});

test("a misspelled artist is corrected to the one in the library, not added again", async ({ page, freshMember }) => {
  const title = `Harbour Reel ${freshMember.id.slice(0, 8)}`;
  try {
    await openAddForm(page);
    await page.getByPlaceholder("e.g. Proud Mary").fill(title);
    await page.getByPlaceholder("e.g. Creedence Clearwater Revival").fill("Delphine Arowood");
    await page.getByRole("button", { name: "Look up" }).click();

    await expect(page.getByText("· Delphine Arrowood")).toBeVisible();
    await expect(page.getByText("You typed “Delphine Arowood”.")).toBeVisible();
    await page.getByRole("button", { name: "Yes, that's the song — add it" }).click();

    await expect(page).toHaveURL(/\/songs\//);
    const { data } = await admin.from("songs").select("display_artist, song_recording_artists(artists(name))").eq("title", title).single();
    expect(data).toEqual({ display_artist: "Delphine Arrowood", song_recording_artists: [{ artists: { name: "Delphine Arrowood" } }] });
    const { count } = await admin.from("artists").select("id", { count: "exact", head: true }).eq("name", "Delphine Arowood");
    expect(count).toBe(0);
  } finally {
    await admin.from("songs").delete().eq("title", title);
  }
});

test("an artist nobody knows gets a spelling warning before it's added", async ({ page, freshMember }) => {
  await openAddForm(page);
  await page.getByPlaceholder("e.g. Proud Mary").fill(`Harbour Waltz ${freshMember.id.slice(0, 8)}`);
  await page.getByPlaceholder("e.g. Creedence Clearwater Revival").fill("Zephyrine Quillfeather");
  await page.getByRole("button", { name: "Look up" }).click();

  await expect(page.getByText("We couldn't find “Zephyrine Quillfeather” on Spotify or in our library. Check the spelling before adding.")).toBeVisible();
});

test("a member adds another tune of words we already have, with a recording of it", async ({ page, freshMember }) => {
  const s = freshMember.id.slice(0, 8);
  const title = `Harbour Hymn ${s}`;
  const { data: text } = await admin.from("texts").insert({ title, slug: "x", kind: "hymn" }).select("id").single();
  const { data: tune } = await admin.from("tunes").insert({ name: `Beacon ${s}`, slug: "x" }).select("id").single();
  try {
    await admin.from("songs").insert({ title, text_id: text!.id, tune_id: tune!.id });
    await openAddForm(page);
    await page.getByPlaceholder("e.g. Proud Mary").fill(title);
    const lookUp = page.getByRole("button", { name: "Look up" });
    const question = page.getByText("is already in the library. Which tune do you sing it to?");
    await expect(async () => {
      if (await lookUp.isVisible()) await lookUp.click();
      await expect(question).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByText(`Beacon ${s}`)).toBeVisible();
    await page.getByRole("button", { name: "I sing it to a different tune" }).click();
    const add = page.getByRole("button", { name: "Add this tune" });
    await page.getByLabel("Link to a recording of your tune").fill("not a link");
    await expect(add).toBeDisabled();
    await page.getByLabel("Link to a recording of your tune").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Tune name").fill(`Westerly ${s}`);
    await add.click();

    await expect(page).toHaveURL(/\/songs\//);
    const { data } = await admin.from("songs").select("tune_id, youtube_url, add_hints").eq("text_id", text!.id).is("tune_id", null).single();
    expect(data).toEqual({
      tune_id: null,
      youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      add_hints: { other_tune: true, tune: `Westerly ${s}` },
    });
  } finally {
    await admin.from("songs").delete().eq("text_id", text!.id);
    await admin.from("tunes").delete().eq("id", tune!.id);
    await admin.from("texts").delete().eq("id", text!.id);
  }
});
