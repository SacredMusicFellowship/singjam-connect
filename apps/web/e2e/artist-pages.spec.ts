import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import { openPage } from "./support/signIn";
import { admin } from "./support/supabase";

// A duo credit names its artists, and each artist's page lists the duo's songs.
test("a duet shows on its artists' pages, and the duo's page names them", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  const names = [`Tobin Ashe ${tag}`, `Lene Varga ${tag}`];
  const duoName = `${names[0]} & ${names[1]}`;
  const title = `Harbour Duet ${tag}`;
  const { data: artists } = await admin.from("artists").insert([...names, duoName].map((name) => ({ name }))).select("id, name, slug");
  const [tobin, lene, duo] = [...names, duoName].map((n) => artists!.find((a) => a.name === n)!);
  const { data: song } = await admin.from("songs").insert({ title, slug: "x", display_artist: duoName }).select("id").single();
  try {
    await admin.from("artist_members").insert([{ group_id: duo.id, member_id: tobin.id, position: 0 }, { group_id: duo.id, member_id: lene.id, position: 1 }]);
    await admin.from("song_recording_artists").insert({ song_id: song!.id, artist_id: duo.id, year: 1983, position: 0 });

    await openPage(page, `/artists/${lene.slug}`);
    await expect(page.getByRole("heading", { name: names[1] })).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(`${duoName} · 1983`)).toBeVisible();
    await page.getByRole("link", { name: duoName }).first().click();

    await expect(page).toHaveURL(new RegExp(`/artists/${duo.slug}`));
    await expect(page.getByRole("link", { name: names[0], exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: names[1], exact: true })).toBeVisible();
  } finally {
    await admin.from("songs").delete().eq("id", song!.id);
    await admin.from("artists").delete().in("id", [tobin.id, lene.id, duo.id]);
  }
});
