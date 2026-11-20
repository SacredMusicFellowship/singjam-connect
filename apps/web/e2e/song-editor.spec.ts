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
