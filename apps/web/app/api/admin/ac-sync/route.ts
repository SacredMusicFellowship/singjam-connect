import { NextResponse } from "next/server";
import { fetchAllRows } from "@singjam/core";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { fetchAllAuthUsers } from "@/lib/authUsers";
import { syncContact, ContactProfile } from "@/lib/activecampaign";

const AC_API_URL = process.env.AC_API_URL;
const AC_API_KEY = process.env.AC_API_KEY;

const SINGJAM_TAG_ID = "24";
const LIST_IDS = ["1", "4", "9"];

async function acFetch(path: string) {
  if (!AC_API_URL || !AC_API_KEY) return null;
  const res = await fetch(`${AC_API_URL}/api/3${path}`, {
    headers: { "Api-Token": AC_API_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchAllACContacts() {
  const contacts: { id: string; email: string }[] = [];
  let offset = 0;
  while (true) {
    const data = await acFetch(`/contacts?limit=100&offset=${offset}`);
    const batch: { id: string; email: string }[] = data?.contacts ?? [];
    contacts.push(...batch);
    if (batch.length < 100) break;
    offset += 100;
  }
  return contacts;
}

type ACProfileRow = {
  id: string;
  display_name: string | null;
  last_name: string | null;
  neighborhood: string | null;
  instrument_levels: Record<string, string> | null;
  favorite_genres: string[] | null;
  singing_voice: string | null;
};

type GuestOrderRow = {
  id: string;
  buyer_email: string;
  buyer_name: string | null;
};

// Guest buyers who ticked the mailing-list box at checkout. They belong on the
// lists but not the SingJam App User tag, and once they make an account they
// are audited as a member instead.
async function fetchOptedInGuests(admin: ReturnType<typeof supabaseAdmin>, memberEmails: Set<string>) {
  const orders = await fetchAllRows<GuestOrderRow>((from, to) =>
    admin
      .from("ticket_orders")
      .select("id,buyer_email,buyer_name")
      .eq("status", "paid")
      .eq("marketing_opt_in", true)
      .is("buyer_user_id", null)
      .not("buyer_email", "is", null)
      .order("id")
      .range(from, to) as any
  );
  const guests = new Map<string, string | null>();
  for (const o of orders) {
    const email = o.buyer_email.toLowerCase();
    if (memberEmails.has(email)) continue;
    if (!guests.has(email) || o.buyer_name) guests.set(email, o.buyer_name);
  }
  return guests;
}

export type ACSyncStatus = {
  email: string;
  userId: string;
  guest: boolean;
  inAC: boolean;
  hasTag: boolean;
  missingLists: string[];
  unsubscribedLists: string[];
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = supabaseAdmin();
  const [sbUsers, acContacts] = await Promise.all([
    fetchAllAuthUsers(admin.auth.admin),
    fetchAllACContacts(),
  ]);

  const acByEmail = new Map(acContacts.map((c) => [c.email?.toLowerCase(), c]));
  const memberEmails = new Set(sbUsers.map((u) => u.email?.toLowerCase() ?? ""));
  const guests = await fetchOptedInGuests(admin, memberEmails);

  const people = [
    ...sbUsers.map((u) => ({ email: u.email?.toLowerCase() ?? "", userId: u.id, guest: false })),
    ...[...guests.keys()].map((email) => ({ email, userId: email, guest: true })),
  ];

  const statuses: ACSyncStatus[] = await Promise.all(
    people.map(async ({ email, userId, guest }) => {
      const acContact = acByEmail.get(email);

      if (!acContact) {
        return { email, userId, guest, inAC: false, hasTag: false, missingLists: [...LIST_IDS], unsubscribedLists: [] };
      }

      const [tagsData, listsData] = await Promise.all([
        acFetch(`/contacts/${acContact.id}/contactTags`),
        acFetch(`/contacts/${acContact.id}/contactLists`),
      ]);

      const tagIds: string[] = (tagsData?.contactTags ?? []).map((t: { tag: string }) => t.tag);
      const contactLists: { list: string; status: string }[] = listsData?.contactLists ?? [];
      const subscribedLists = new Set<string>(contactLists.filter((cl) => cl.status === "1").map((cl) => cl.list));
      const unsubscribedListSet = new Set<string>(contactLists.filter((cl) => cl.status === "2").map((cl) => cl.list));

      return {
        email,
        userId,
        guest,
        inAC: true,
        hasTag: tagIds.includes(SINGJAM_TAG_ID),
        missingLists: LIST_IDS.filter((id) => !subscribedLists.has(id) && !unsubscribedListSet.has(id)),
        unsubscribedLists: LIST_IDS.filter((id) => unsubscribedListSet.has(id)),
      };
    })
  );

  return NextResponse.json(statuses);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { userIds = [], guestEmails = [] }: { userIds?: string[]; guestEmails?: string[] } = await req.json();
  if (!Array.isArray(userIds) || !Array.isArray(guestEmails) || userIds.length + guestEmails.length === 0) {
    return NextResponse.json({ error: "userIds or guestEmails required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const [sbUsers, profiles] = await Promise.all([
    fetchAllAuthUsers(admin.auth.admin),
    fetchAllRows<ACProfileRow>((from, to) =>
      admin
        .from("profiles")
        .select("id,display_name,last_name,neighborhood,instrument_levels,favorite_genres,singing_voice")
        .order("id")
        .range(from, to) as any
    ),
  ]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const memberEmails = new Set(sbUsers.map((u) => u.email?.toLowerCase() ?? ""));
  const guests = guestEmails.length > 0 ? await fetchOptedInGuests(admin, memberEmails) : new Map<string, string | null>();

  const targets = sbUsers.filter((u) => userIds.includes(u.id));

  let synced = 0;
  let failed = 0;

  await Promise.all(
    targets.map(async (u) => {
      if (!u.email) { failed++; return; }
      const p = profileById.get(u.id);
      const profile: ContactProfile = {
        firstName: p?.display_name || undefined,
        lastName: p?.last_name || undefined,
        neighborhood: p?.neighborhood || undefined,
        singingVoice: p?.singing_voice
          ? p.singing_voice.split(",").map((s) => s.trim())
          : undefined,
        instrumentLevels: p?.instrument_levels || undefined,
        favoriteGenres: p?.favorite_genres || undefined,
      };
      try {
        const failures = await syncContact(u.email, profile);
        if (failures.length > 0) failed++;
        else synced++;
      } catch {
        failed++;
      }
    })
  );

  // Only emails that really are opted-in guests — the request body can't put
  // an arbitrary address on the lists.
  await Promise.all(
    guestEmails.map(async (raw) => {
      const email = raw.toLowerCase();
      if (!guests.has(email)) { failed++; return; }
      const [firstName, ...rest] = (guests.get(email) ?? "").trim().split(/\s+/);
      try {
        const failures = await syncContact(email, {
          ...(firstName ? { firstName } : {}),
          ...(rest.length ? { lastName: rest.join(" ") } : {}),
        }, { tag: false });
        if (failures.length > 0) failed++;
        else synced++;
      } catch {
        failed++;
      }
    })
  );

  return NextResponse.json({ synced, failed });
}
