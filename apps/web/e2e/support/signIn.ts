import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { E2E_PASSWORD } from "@singjam/test-fixtures";

// Opens a page and waits for it to settle. Typing into a form before React hydrates it is lost
// when hydration resets the inputs, which WebKit hits often. If a client-side redirect still
// running from the previous page (after signing in or out) cuts the navigation short, try again.
export async function openPage(page: Page, url: string): Promise<void> {
  await expect(async () => {
    await page.goto(url);
  }).toPass();
  await page.waitForLoadState("networkidle");
}

export async function signIn(page: Page, email: string, password = E2E_PASSWORD): Promise<void> {
  await openPage(page, "/auth");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Sign-in lands on the repertoire, account setup or a claimed ticket's event, sometimes by way of
  // another page; wait for the destination so a following goto isn't cut short by it.
  await page.waitForURL(/\/(repertoire|account|jam\/)/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
}
