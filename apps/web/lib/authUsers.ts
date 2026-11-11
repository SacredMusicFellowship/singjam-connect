export type AuthUserRecord = { id: string; email?: string | null };

type AuthUserPage = {
  data: { users: AuthUserRecord[] };
  error: { message: string } | null;
};

type AuthAdmin = {
  listUsers: (params: { page: number; perPage: number }) => Promise<AuthUserPage>;
};

/**
 * listUsers returns one page at a time, so a single call silently stops at
 * perPage — the same truncation trap as an uncapped .limit(). Walk every page,
 * and throw rather than hand back a partial list.
 */
export async function fetchAllAuthUsers(
  admin: AuthAdmin,
  perPage = 1000
): Promise<AuthUserRecord[]> {
  const users: AuthUserRecord[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) return users;
  }
}

/** Email addresses live on auth.users, not profiles — keyed by user id. */
export async function fetchAllAuthEmails(
  admin: AuthAdmin,
  perPage = 1000
): Promise<Map<string, string>> {
  const users = await fetchAllAuthUsers(admin, perPage);
  const emails = new Map<string, string>();
  for (const user of users) {
    if (user.email) emails.set(user.id, user.email);
  }
  return emails;
}

/** The account registered to this address, if any — compared case-insensitively. */
export async function findAuthUserByEmail(
  admin: AuthAdmin,
  email: string,
  perPage = 1000
): Promise<AuthUserRecord | null> {
  const target = email.trim().toLowerCase();
  const users = await fetchAllAuthUsers(admin, perPage);
  return users.find((u) => u.email?.toLowerCase() === target) ?? null;
}
