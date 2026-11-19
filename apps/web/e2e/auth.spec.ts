import { randomUUID } from "node:crypto";
import { E2E_PASSWORD } from "@singjam/test-fixtures";
import { expect, refs, test } from "./fixtures";
import { latestEmailHtml } from "./support/mailpit";
import { openPage, signIn } from "./support/signIn";
import { admin, createFreshMember, deleteMember } from "./support/supabase";

const emailInput = 'input[type="email"]';

test("a wrong password shows an error and stays on sign in", async ({ page }) => {
  await openPage(page, "/auth");
  await page.locator(emailInput).fill(refs.members.member.auth.email);
  await page.locator('input[type="password"]').fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Invalid login credentials")).toBeVisible();
  await expect(page).toHaveURL(/\/auth/);
});

test("signing up creates an account and opens profile setup", async ({ page }) => {
  const email = `e2e-signup-${randomUUID().slice(0, 8)}@singjam.test`;
  await openPage(page, "/auth?mode=signup");
  await page.locator(emailInput).fill(email);
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill(E2E_PASSWORD);
  await passwords.nth(1).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();

  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data.users.find((u) => u.email === email);
  expect(user).toBeDefined();
  await deleteMember(user!.id);
});

test("signing out ends the session", async ({ page, freshMember }) => {
  await openPage(page, "/account");
  await expect(page.getByText(freshMember.email)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  await openPage(page, "/account");
  await expect(page).toHaveURL(/\/auth/);
});

test("a password reset email lets a member choose a new password", async ({ page }) => {
  const member = await createFreshMember();
  try {
    await openPage(page, "/auth");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.locator(emailInput).fill(member.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("a password reset link is on its way")).toBeVisible();

    const html = await latestEmailHtml(member.email);
    const link = html.match(/href="([^"]+)"/)![1].replaceAll("&amp;", "&");
    expect(link).toContain("/auth/confirm?token_hash=");
    // Opened in a new tab, as from an email client.
    const resetPage = await page.context().newPage();
    await openPage(resetPage, link);
    await expect(resetPage.getByRole("heading", { name: "Set new password" })).toBeVisible();

    const newPassword = `${E2E_PASSWORD}-new`;
    await resetPage.getByPlaceholder("Min. 8 characters").fill(newPassword);
    await resetPage.getByPlaceholder("Repeat password").fill(newPassword);
    await resetPage.getByRole("button", { name: "Set new password" }).click();
    await expect(resetPage.getByText("Your password has been changed.")).toBeVisible();
    await resetPage.close();

    await page.context().clearCookies();
    await signIn(page, member.email, newPassword);
  } finally {
    await deleteMember(member.id);
  }
});

test("deleting an account removes the member", async ({ page, freshMember }) => {
  await openPage(page, "/account");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByPlaceholder("DELETE").fill("DELETE");
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  const { data } = await admin.auth.admin.getUserById(freshMember.id);
  expect(data.user).toBeNull();
});
