/**
 * The URL if it is an ordinary web address (http or https), otherwise null.
 * For links people type in and others click, so a `javascript:` or `data:`
 * URL can never become a link on someone else's screen.
 */
export function webUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const { protocol } = new URL(trimmed);
    return protocol === "https:" || protocol === "http:" ? trimmed : null;
  } catch {
    return null;
  }
}
