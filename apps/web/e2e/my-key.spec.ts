import type { Locator, Page } from "@playwright/test";
import { expect, scenario, test } from "./fixtures";
import { openPage } from "./support/signIn";
import { admin } from "./support/supabase";

// The longest mode name, so the pill is as wide as it gets.
const song = [...scenario.songs].filter((s) => s.tonality === "Mixolydian").sort((a, b) => a.title.localeCompare(b.title))[0];
// A song with no mode on a phone, for checking the buttons line up between rows.
const majorSong = [...scenario.songs].filter((s) => s.tonality === "Major").sort((a, b) => a.title.localeCompare(b.title))[0];

// The widths of a row's buttons, left to right.
async function buttonWidths(pill: Locator) {
  const row = pill.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' flex-wrap ')][1]");
  return row.evaluate((el) => [...el.children].map((c) => Math.round(c.getBoundingClientRect().width)).filter((w) => w > 0));
}

// The narrowest common phone, and the narrowest width that shows the full mode.
async function narrowest(page: Page) {
  const phone = page.viewportSize()!.width < 640;
  await page.setViewportSize({ width: phone ? 360 : 640, height: 800 });
  return phone;
}

// The pill's visible label (the select's options and the hidden size-holders share its text).
const label = (pill: Locator, text: string) => pill.getByText(text, { exact: true }).filter({ visible: true });

// Every control in the pill's row sits on one line, and on a phone fills it.
async function expectOneLine(pill: Locator, phone: boolean) {
  const row = pill.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' flex-wrap ')][1]");
  const boxes = await row.evaluate((el) =>
    [...el.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => ({ top: r.top, bottom: r.bottom })),
  );
  expect(boxes.length).toBeGreaterThan(1);
  expect(Math.max(...boxes.map((b) => b.top))).toBeLessThan(Math.min(...boxes.map((b) => b.bottom)));
  // On a phone the buttons fill the row to its end.
  if (phone) {
    const { right, end } = await row.evaluate((el) => ({ right: Math.max(...[...el.children].map((c) => c.getBoundingClientRect().right)), end: el.getBoundingClientRect().right }));
    expect(end - right).toBeLessThan(2);
  }
}

test("my key reads as a chord chart writes it, and the action buttons stay on one line and line up", async ({ page, freshMember }) => {
  await admin
    .from("user_songs")
    .insert([
      { user_id: freshMember.id, song_id: song.id, confidence: "learn", key_note: "A" },
      { user_id: freshMember.id, song_id: majorSong.id, confidence: "learn", key_note: "G" },
    ])
    .throwOnError();
  const phone = await narrowest(page);
  // A Mixolydian reads "A" and G major "G", as on a chord chart (#492).
  const shown = "A";

  // A set of their own, so every row shows Add to set.
  await admin.from("sets").insert({ owner_user_id: freshMember.id, name: "Spring practice" }).throwOnError();

  await openPage(page, `/songs/${song.slug}`);
  const songPill = page.getByRole("combobox", { name: "My key", exact: true }).first().locator("..");
  await expect(label(songPill, shown)).toBeVisible();
  await expectOneLine(songPill, phone);
  await expect(label(songPill, phone ? "Key" : "My key")).toBeVisible();

  await openPage(page, "/repertoire");
  const rowPill = page.getByRole("combobox", { name: `My key for ${song.title}` }).locator("..");
  await expect(label(rowPill, shown)).toBeVisible();
  await expectOneLine(rowPill, phone);
  const majorPill = page.getByRole("combobox", { name: `My key for ${majorSong.title}` }).locator("..");
  await expect(label(majorPill, "G")).toBeVisible();
  expect(await buttonWidths(majorPill)).toEqual(await buttonWidths(rowPill));

  await openPage(page, `/search?q=${encodeURIComponent(song.title)}`);
  const cardSelect = page.getByRole("combobox", { name: `My key for ${song.title}` });
  await expect(label(cardSelect.locator(".."), shown)).toBeVisible();
  await expectOneLine(cardSelect.locator(".."), phone);

  await expect(cardSelect.locator("option", { hasText: "D Mixolydian" })).toHaveCount(1);
  await cardSelect.selectOption("D");
  await expect(label(cardSelect.locator(".."), "D")).toBeVisible();
  await expect
    .poll(async () => (await admin.from("user_songs").select("key_note").eq("user_id", freshMember.id).eq("song_id", song.id).single()).data?.key_note)
    .toBe("D");
});
