import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { E2E_PASSWORD } from "@singjam/test-fixtures";

// Opens a page and waits for it to settle. Typing into a form before React hydrates it is lost
// when hydration resets the inputs, which WebKit hits often.
export async function openPage(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

export async function signIn(page: Page, email: string, password = E2E_PASSWORD): Promise<void> {
  await openPage(page, "/auth");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });
  // Sign-in hands off to its destination in more than one step; let it land before moving on.
  await page.waitForLoadState("networkidle");
}
