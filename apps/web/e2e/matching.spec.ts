import { authFile, expect, refs, scenario, test } from "./fixtures";

test.use({ storageState: authFile("member") });

// Matches count songs both members know (lead or support), not ones either is still learning.
function knownSongs(userId: string) {
  return new Set(scenario.userSongs.filter((s) => s.user_id === userId && s.confidence !== "learn").map((s) => s.song_id));
}

test("the member's top match is the host, with the shared songs the seed gives them", async ({ page }) => {
  const mine = knownSongs(refs.members.member.profile.id);
  const shared = [...knownSongs(refs.members.host.profile.id)].filter((id) => mine.has(id)).length;

  await page.goto("/friends");
  const { display_name, last_name } = refs.members.host.profile;
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: /^(?!View profile)/ }).first()).toHaveText(`${display_name} ${last_name}`);
  const firstCount = main.getByText("shared songs", { exact: true }).first().locator("xpath=..");
  await expect(firstCount).toHaveText(`${shared}shared songs`);
});
