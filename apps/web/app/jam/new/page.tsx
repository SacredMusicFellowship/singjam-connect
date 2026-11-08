import { jamTags } from "@singjam/core";
import { redirect } from "next/navigation";
import { getSessionServer, supabaseServer } from "@/lib/supabase/server";
import NewJamForm, { type NewJamInitialData } from "@/components/NewJamForm";
import { devGuardOn } from "@/lib/devSafety";

export default async function NewJamPage({ searchParams }: { searchParams: Promise<{ copy?: string }> }) {
  const session = await getSessionServer();
  const { copy } = await searchParams;
  if (!session) redirect(`/auth?next=${encodeURIComponent(copy ? `/jam/new?copy=${copy}` : "/jam/new")}`);
  let initialData: NewJamInitialData | null = null;

  if (copy) {
    const supabase = await supabaseServer();
    // Copying a public jam you haven't RSVP'd to doesn't hand you its address.
    const [jamRes, tagsRes, addressRes] = await Promise.all([
      supabase
        .from("jams")
        .select("name, visibility, notes, neighborhood, capacity, guests_can_invite, tickets_url, image_url, image_focal_point, image_desktop_url, image_mobile_url, image_list_url, image_crops, starts_at, ends_at, timezone")
        .eq("id", copy)
        .maybeSingle(),
      supabase.from("jam_tags").select("tags(id, name, type)").eq("jam_id", copy),
      supabase.rpc("jam_full_address", { jam_id_param: copy }),
    ]);

    if (jamRes.data) {
      const jam = jamRes.data as any;
      const tz = jam.timezone ?? "UTC";
      const fmt = (iso: string | null) => {
        if (!iso) return "";
        const parts = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).formatToParts(new Date(iso));
        const h = parts.find((p) => p.type === "hour")?.value ?? "00";
        const m = parts.find((p) => p.type === "minute")?.value ?? "00";
        return `${h}:${m}`;
      };
      initialData = {
        copyFromId: copy,
        visibility: jam.visibility,
        name: jam.name ?? "",
        notes: jam.notes ?? "",
        fullAddress: (addressRes.data as string | null) ?? "",
        neighborhood: jam.neighborhood ?? "",
        capacity: jam.capacity ? String(jam.capacity) : "",
        guestsCanInvite: jam.guests_can_invite ?? false,
        ticketsUrl: jam.tickets_url ?? "",
        images: {
          image_url: jam.image_url,
          image_focal_point: jam.image_focal_point,
          image_desktop_url: jam.image_desktop_url,
          image_mobile_url: jam.image_mobile_url,
          image_list_url: jam.image_list_url,
          image_crops: jam.image_crops,
        },
        selectedGenreIds: jamTags(tagsRes.data as any, "genre").map((t) => t.id as string),
        selectedThemeIds: jamTags(tagsRes.data as any, "theme").map((t) => t.id as string),
        startTime: fmt(jam.starts_at),
        endTime: fmt(jam.ends_at),
        timezone: jam.timezone ?? null,
      };
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{initialData ? "Copy jam" : "Post a jam"}</h1>
      <p className="text-sm text-zinc-600">Casual. The full address is only shared with people who RSVP.</p>
      <NewJamForm initialData={initialData} privateOnly={devGuardOn()} />
    </div>
  );
}
