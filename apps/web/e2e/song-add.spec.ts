import { expect, test } from "./fixtures";
import { openPage } from "./support/signIn";
import { admin } from "./support/supabase";

test("a member adds a missing song and says how they know it and how it starts", async ({ page, freshMember }) => {
  const title = `Harbour Carol ${freshMember.id.slice(0, 8)}`;
  try {
    await openPage(page, "/search");
    await page.getByRole("button", { name: "Add a missing song" }).click();
    await page.getByPlaceholder("e.g. Proud Mary").fill(title);
    await page.getByRole("button", { name: "Look up" }).click();

    await expect(page.getByText("Is this the song?")).toBeVisible();
    const hymn = page.getByRole("button", { name: "Hymn, carol or worship" });
    await hymn.click();
    await expect(hymn).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("How does it start?").fill("Lights along the harbour, shining through the night");
    await page.getByRole("button", { name: "Add song", exact: true }).click();

    await expect(page).toHaveURL(/\/songs\//);
    const { data } = await admin.from("songs").select("known_by_recording, add_hints, first_line").eq("title", title).single();
    expect(data).toEqual({
      known_by_recording: false,
      add_hints: { known_as: "hymn", first_line: "Lights along the harbour, shining through the night" },
      first_line: null,
    });
  } finally {
    await admin.from("songs").delete().eq("title", title);
  }
});
