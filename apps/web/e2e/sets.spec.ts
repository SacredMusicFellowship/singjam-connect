import { expect, test } from "./fixtures";
import { openPage } from "./support/signIn";
import { admin } from "./support/supabase";

test("a member creates a set, adds a song and deletes the set", async ({ page, freshMember }) => {
  await openPage(page, "/set/new");
  await page.getByPlaceholder("e.g. Friday night gig").fill("Porch rehearsal");
  await page.getByRole("button", { name: "Create set" }).click();
  await expect(page.getByRole("heading", { name: "Porch rehearsal", level: 1 })).toBeVisible();

  const { data: set } = await admin.from("sets").select("id").eq("owner_user_id", freshMember.id).single();

  await page.getByPlaceholder("Search songs…").fill("Paper Boats");
  await page.getByRole("listitem").filter({ hasText: "Paper Boats" }).getByRole("button", { name: "Add to set list" }).click();
  // The new member doesn't know the song yet, so the set asks how well they know it.
  await page.getByRole("button", { name: "Learn", exact: true }).click();
  await expect
    .poll(async () => (await admin.from("set_songs").select("id", { count: "exact", head: true }).eq("set_id", set!.id)).count)
    .toBe(1);

  await expect(page.getByRole("link", { name: "Paper Boats" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Delete set" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(/\/sets/, { timeout: 15_000 });
  await expect.poll(async () => (await admin.from("sets").select("id").eq("id", set!.id)).data?.length).toBe(0);
});

test("a set's QR code encodes its invite link, and that link opens the set", async ({ page, freshMember }) => {
  const { data: set } = await admin
    .from("sets")
    .insert({ name: "Front porch songs", owner_user_id: freshMember.id, link_sharing: "private" })
    .select("id, short_code")
    .single();

  await openPage(page, "/sets");
  const link = await page.request.post(`/api/sets/${set!.id}/invite/link`, { data: { role: "viewer" } });
  expect(link.ok()).toBe(true);
  const { url } = await link.json();
  expect(new URL(url).pathname).toBe(`/set/${set!.short_code}`);
  const token = new URL(url).searchParams.get("invite")!;

  const qr = await page.request.get(`/api/sets/${set!.id}/qr?invite=${token}`);
  expect(qr.status()).toBe(200);
  expect(qr.headers()["content-type"]).toBe("image/png");
  expect((await qr.body()).subarray(1, 4).toString()).toBe("PNG");
  expect((await page.request.get(`/api/sets/${set!.id}/qr?invite=not-a-token`)).status()).toBe(404);

  await openPage(page, `/set/${set!.short_code}?invite=${token}`);
  await expect(page.getByRole("heading", { name: "Front porch songs", level: 1 })).toBeVisible();
  await admin.from("sets").delete().eq("id", set!.id);
});
