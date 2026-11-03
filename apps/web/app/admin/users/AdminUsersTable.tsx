"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import SearchInput from "@/components/SearchInput";
import { matchesSearch } from "@/lib/normalizeSearch";
import { ROLE_LABELS, USER_ROLES, isUserRole, roleLabel, type UserRole } from "@/lib/userRoles";

export type AdminUser = {
  id: string;
  display_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  neighborhood: string | null;
  created_at: string | null;
  email: string | null;
  role: string;
  events: number;
};

type SortCol = "name" | "email" | "neighborhood" | "joined" | "events" | "role";
type SortDir = "asc" | "desc";

// The page container is max-w-4xl, so the desktop table is laid out on fixed
// percentages rather than letting long emails push the role picker off the edge.
const COLUMNS: { key: SortCol; label: string; width: string }[] = [
  { key: "name", label: "User", width: "24%" },
  { key: "email", label: "Email", width: "22%" },
  { key: "neighborhood", label: "Neighborhood", width: "15%" },
  { key: "joined", label: "Joined", width: "13%" },
  { key: "events", label: "Events", width: "9%" },
  { key: "role", label: "Role", width: "17%" },
];

function fullName(u: AdminUser) {
  return [u.display_name, u.last_name].filter(Boolean).join(" ") || u.username || "Unnamed";
}

function profileHref(u: AdminUser) {
  return u.username ? `/u/${u.username}` : `/profile/${u.id}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function attendanceHref(u: AdminUser) {
  return `/admin/attendance?email=${encodeURIComponent(u.email ?? "")}`;
}

function Avatar({ user }: { user: AdminUser }) {
  const name = fullName(user);
  return (
    <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-200">
      {user.avatar_url ? (
        <Image src={user.avatar_url} alt={name} fill sizes="32px" className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xs font-medium text-zinc-500">
          {name[0].toUpperCase()}
        </span>
      )}
    </span>
  );
}

function UserCell({ user }: { user: AdminUser }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar user={user} />
      <div className="min-w-0">
        <Link
          href={profileHref(user)}
          className="block truncate font-medium text-slate-900 hover:text-amber-600 hover:underline"
        >
          {fullName(user)}
        </Link>
        {user.username && <div className="truncate text-xs text-slate-400">@{user.username}</div>}
      </div>
    </div>
  );
}

function RoleSelect({
  user,
  role,
  isSelf,
  saving,
  error,
  onChange,
}: {
  user: AdminUser;
  role: string;
  isSelf: boolean;
  saving: boolean;
  error?: string;
  onChange: (role: UserRole) => void;
}) {
  return (
    <div>
      <select
        value={role}
        onChange={(e) => onChange(e.target.value as UserRole)}
        disabled={isSelf || saving}
        aria-label={`Role for ${fullName(user)}`}
        title={isSelf ? "You can't change your own role — ask another admin." : undefined}
        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
      >
        {/* A role outside the grantable set (e.g. a retired enum label) still needs an option to show */}
        {!isUserRole(role) && <option value={role}>{roleLabel(role)}</option>}
        {USER_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      {saving && <p className="mt-1 text-xs text-slate-400">Saving…</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export default function AdminUsersTable({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string;
}) {
  const [roles, setRoles] = useState<Record<string, string>>(() =>
    Object.fromEntries(users.map((u) => [u.id, u.role]))
  );
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "joined", dir: "desc" });

  async function changeRole(id: string, role: UserRole) {
    const previous = roles[id];
    setRoles((prev) => ({ ...prev, [id]: role }));
    setSaving((prev) => new Set(prev).add(id));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    const res = await fetch(`/api/admin/users/${id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }).catch(() => null);

    const message = res?.ok
      ? null
      : res
        ? ((await res.json().catch(() => ({}))).error ?? "Could not save that role")
        : "Could not save that role — check your connection.";

    setSaving((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    if (message) {
      setRoles((prev) => ({ ...prev, [id]: previous }));
      setErrors((prev) => ({ ...prev, [id]: message }));
    }
  }

  function toggleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: col === "joined" || col === "events" ? "desc" : "asc" }
    );
  }

  const filtered = useMemo(
    () =>
      users.filter((u) =>
        matchesSearch(
          [fullName(u), u.username ?? "", u.email ?? "", u.neighborhood ?? ""].join(" "),
          query
        )
      ),
    [users, query]
  );

  const sorted = useMemo(() => {
    const { col, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (col === "name") cmp = fullName(a).localeCompare(fullName(b));
      else if (col === "email") cmp = (a.email ?? "").localeCompare(b.email ?? "");
      else if (col === "neighborhood") cmp = (a.neighborhood ?? "").localeCompare(b.neighborhood ?? "");
      else if (col === "joined") cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
      else if (col === "events") cmp = a.events - b.events;
      else if (col === "role")
        cmp = USER_ROLES.indexOf(roles[a.id] as UserRole) - USER_ROLES.indexOf(roles[b.id] as UserRole);
      return cmp * mul || fullName(a).localeCompare(fullName(b));
    });
  }, [filtered, sort, roles]);

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm">
        <label htmlFor="admin-users-search" className="mb-1 block text-sm font-medium">
          Search
        </label>
        <SearchInput
          id="admin-users-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          placeholder="Search by name, username, email, or neighborhood…"
          autoComplete="off"
        />
        {query.trim() && (
          <p className="mt-2 text-xs text-zinc-500">
            {filtered.length} of {users.length} users
          </p>
        )}
      </div>

      {/* Mobile sort controls */}
      <div className="sm:hidden flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <label htmlFor="admin-users-sort" className="text-xs font-medium text-slate-500">
          Sort by
        </label>
        <select
          id="admin-users-sort"
          value={sort.col}
          onChange={(e) => toggleSort(e.target.value as SortCol)}
          className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700"
        >
          {COLUMNS.map((col) => (
            <option key={col.key} value={col.key}>
              {col.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setSort((prev) => ({ ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }))}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-500"
          aria-label={sort.dir === "asc" ? "Sort ascending" : "Sort descending"}
        >
          {sort.dir === "asc" ? "↑" : "↓"}
        </button>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {sorted.map((u) => (
          <div key={u.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <UserCell user={u} />
            {u.email && (
              <a
                href={`mailto:${u.email}`}
                title={u.email}
                className="mt-1.5 block truncate text-xs text-slate-500 hover:text-amber-600"
              >
                {u.email}
              </a>
            )}
            <div className="mt-1.5 truncate text-xs text-slate-500">
              {[u.neighborhood, `Joined ${formatDate(u.created_at)}`].filter(Boolean).join(" · ")}
              {u.events > 0 && (
                <>
                  {" · "}
                  <Link href={attendanceHref(u)} className="hover:text-amber-600 hover:underline">
                    {u.events} {u.events === 1 ? "event" : "events"}
                  </Link>
                </>
              )}
            </div>
            <div className="mt-2">
              <RoleSelect
                user={u}
                role={roles[u.id]}
                isSelf={u.id === currentUserId}
                saving={saving.has(u.id)}
                error={errors[u.id]}
                onChange={(role) => changeRole(u.id, role)}
              />
            </div>
          </div>
        ))}
        {!sorted.length && (
          <p className="py-8 text-center text-sm text-slate-400">No users match that search.</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[48rem] table-fixed text-sm">
          <colgroup>
            {COLUMNS.map((col) => (
              <col key={col.key} style={{ width: col.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-3 select-none">
                  <button
                    onClick={() => toggleSort(col.key)}
                    className="flex items-center gap-1 hover:text-slate-800"
                  >
                    {col.label}
                    <span className="text-slate-300">
                      {sort.col === col.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <UserCell user={u} />
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {u.email ? (
                    <a
                      href={`mailto:${u.email}`}
                      title={u.email}
                      className="block truncate hover:text-amber-600 hover:underline"
                    >
                      {u.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {u.neighborhood ? (
                    <span className="block truncate" title={u.neighborhood}>
                      {u.neighborhood}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{formatDate(u.created_at)}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {u.events > 0 ? (
                    <Link href={attendanceHref(u)} className="hover:text-amber-600 hover:underline">
                      {u.events}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <RoleSelect
                    user={u}
                    role={roles[u.id]}
                    isSelf={u.id === currentUserId}
                    saving={saving.has(u.id)}
                    error={errors[u.id]}
                    onChange={(role) => changeRole(u.id, role)}
                  />
                </td>
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-slate-400">
                  No users match that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
