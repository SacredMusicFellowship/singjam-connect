"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import LocationAutocomplete, { type LocationValue } from "./LocationAutocomplete";
import TagCombobox from "./TagCombobox";
import JamCard, { JamMap, JamPoster, JamSplit } from "./JamCard";
import EventImageEditor from "./EventImageEditor";
import JamTimezoneNote from "./JamTimezoneNote";
import { useAddressTimezone } from "@/lib/useAddressTimezone";
import { useJamImages, type JamImageFields } from "@/lib/useJamImages";
import { jamPath, zonedInputToIso } from "@singjam/core";
import { visibilityForNewJam } from "@/lib/devSafety";

type LookupItem = { id: string; name: string };

export type NewJamInitialData = {
  copyFromId: string;
  visibility: "community" | "private" | "official";
  name: string;
  notes: string;
  fullAddress: string;
  neighborhood: string;
  capacity: string;
  guestsCanInvite: boolean;
  ticketsUrl: string;
  images: JamImageFields;
  selectedGenreIds: string[];
  selectedThemeIds: string[];
  startTime: string;
  endTime: string;
  timezone: string | null;
};

function Label({ text, required, optional }: { text: string; required?: boolean; optional?: boolean }) {
  return (
    <label className="block text-sm font-medium">
      {text}
      {required && <span className="ml-1 text-red-500">*</span>}
      {optional && <span className="ml-1.5 text-xs font-normal text-zinc-400">optional</span>}
    </label>
  );
}

export default function NewJamForm({
  initialData,
  privateOnly = false,
}: {
  initialData?: NewJamInitialData | null;
  privateOnly?: boolean;
}) {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [canPostOfficial, setCanPostOfficial] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"community" | "private" | "official">(
    visibilityForNewJam(initialData?.visibility ?? "community", privateOnly)
  );
  const [previewing, setPreviewing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const [genres, setGenres] = useState<LookupItem[]>([]);
  const [themes, setThemes] = useState<LookupItem[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(initialData?.selectedGenreIds ?? []);
  const [selectedThemes, setSelectedThemes] = useState<string[]>(initialData?.selectedThemeIds ?? []);

  const [guestsCanInvite, setGuestsCanInvite] = useState(initialData?.guestsCanInvite ?? false);
  const [name, setName] = useState(initialData?.name ?? "");
  const [ticketsUrl, setTicketsUrl] = useState(initialData?.ticketsUrl ?? "");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState(initialData?.startTime ?? "");
  const [endTime, setEndTime] = useState(initialData?.endTime ?? "");
  const [location, setLocation] = useState<LocationValue>({
    fullAddress: initialData?.fullAddress ?? "",
    neighborhood: initialData?.neighborhood ?? "",
  });
  const [locationTbd, setLocationTbd] = useState(false);
  const { timezone, resolving: resolvingTimezone } = useAddressTimezone(locationTbd ? null : location.fullAddress, initialData?.fullAddress ?? null, initialData?.timezone ?? null);
  const [capacity, setCapacity] = useState(initialData?.capacity ?? "");
  const [description, setDescription] = useState(initialData?.notes ?? "");
  const images = useJamImages(initialData?.images);
  const [previewImages, setPreviewImages] = useState<JamImageFields | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const { data: p } = await supabase.from("profiles").select("role, can_host_official, display_name, username").eq("id", uid).single();
        setCanPostOfficial((p as any)?.role === "admin" || (p as any)?.can_host_official === true);
        setDisplayName((p as any)?.display_name ?? (p as any)?.username ?? null);
      }
      const [{ data: g }, { data: t }] = await Promise.all([
        supabase.from("genres").select("id, name").order("name"),
        supabase.from("themes").select("id, name").order("name"),
      ]);
      setGenres((g as LookupItem[]) ?? []);
      setThemes((t as LookupItem[]) ?? []);
    }
    load();
  }, [supabase]);

  function toIso(d: string, t: string) {
    if (!d || !t || !timezone) return null;
    return zonedInputToIso(`${d}T${t}`, timezone);
  }

  function validate() {
    const errs: string[] = [];
    if (!date) errs.push("Date is required.");
    if (!startTime) errs.push("Start time is required.");
    if (!locationTbd && !location.fullAddress) errs.push("Location is required.");
    return errs;
  }

  async function goToPreview() {
    const errs = validate();
    if (errs.length > 0) { setErrors(errs); return; }
    try {
      setPreviewImages(await images.previewFields());
    } catch (e: any) {
      setErrors([e.message]);
      return;
    }
    setErrors([]);
    setPreviewing(true);
  }

  async function publish() {
    setBusy(true);
    setStatus(null);

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setBusy(false); setStatus("Not signed in."); return; }

    let imageFields: JamImageFields;
    try {
      imageFields = await images.commit(supabase, uid);
    } catch (e: any) {
      setBusy(false);
      setStatus(e.message);
      return;
    }

    const defaultName = displayName ? `${displayName}'s jam` : "Community jam";
    const jamName = name.trim() || (visibility === "official" ? null : defaultName);

    const { data, error } = await supabase.from("jams").insert({
      host_user_id: uid,
      name: jamName,
      starts_at: toIso(date, startTime),
      ends_at: toIso(date, endTime),
      neighborhood: locationTbd ? "TBD" : (location.neighborhood || location.fullAddress || null),
      full_address: locationTbd ? null : (location.fullAddress || null),
      notes: description || null,
      visibility: visibilityForNewJam(visibility, privateOnly),
      guests_can_invite: (visibility === "private" || visibility === "community") ? guestsCanInvite : false,
      tickets_url: visibility === "official" && ticketsUrl ? ticketsUrl : null,
      ...imageFields,
      capacity: capacity ? parseInt(capacity, 10) : null,
      timezone,
      created_at: new Date().toISOString(),
    }).select("id, short_code").single();

    if (error || !data?.id) {
      setBusy(false);
      setStatus(error?.message ?? "Something went wrong.");
      return;
    }

    const jamId = data.id;
    await Promise.all([
      selectedGenres.length > 0
        ? supabase.from("jam_genres").insert(selectedGenres.map((genre_id) => ({ jam_id: jamId, genre_id })))
        : Promise.resolve(),
      selectedThemes.length > 0
        ? supabase.from("jam_themes").insert(selectedThemes.map((theme_id) => ({ jam_id: jamId, theme_id })))
        : Promise.resolve(),
    ]);

    fetch("/api/jam/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jamId }),
    }).catch(() => {});

    if (initialData && visibility === "official") {
      const res = await fetch(`/api/jam/${jamId}/tickets/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: initialData.copyFromId }),
      }).catch(() => null);
      const body = await res?.json().catch(() => null);
      const problems = !res?.ok
        ? [`Tickets weren't copied: ${body?.error ?? "something went wrong"}`]
        : (body.skipped as { code: string; reason: string }[]).map((s) => `${s.code}: ${s.reason}`);
      if (problems.length > 0) window.alert(`The event was created, but:\n\n${problems.join("\n")}`);
      if (res?.ok && body.tiers > 0) {
        router.push(`/jam/${jamId}/tickets/manage`);
        return;
      }
    }

    router.push(jamPath(data));
  }

  const isOfficial = visibility === "official";

  const previewGenreNames = selectedGenres.map((id) => genres.find((g) => g.id === id)?.name).filter(Boolean) as string[];
  const previewThemeNames = selectedThemes.map((id) => themes.find((t) => t.id === id)?.name).filter(Boolean) as string[];
  const defaultName = displayName ? `${displayName}'s jam` : "Community jam";
  const previewName = name.trim() || (isOfficial ? null : defaultName);

  if (previewing) {
    const previewJam = {
      name: previewName,
      visibility,
      starts_at: toIso(date, startTime),
      ends_at: toIso(date, endTime),
      neighborhood: locationTbd ? "TBD" : (location.neighborhood || location.fullAddress || null),
      full_address: locationTbd ? null : (location.fullAddress || null),
      notes: description || null,
      tickets_url: isOfficial && ticketsUrl ? ticketsUrl : null,
      ...previewImages!,
      genres: previewGenreNames,
      themes: previewThemeNames,
      host: displayName,
      capacity: capacity ? parseInt(capacity, 10) : null,
      timezone,
      hasFullAccess: true, // show full address in preview
    };
    const card = (
      <JamCard
        jam={previewJam}
        showMap={false}
        actions={
          <div className="flex gap-3">
            <button
              onClick={() => setPreviewing(false)}
              className="rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              ← Edit
            </button>
            <button
              onClick={publish}
              disabled={busy || resolvingTimezone || !timezone}
              className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {busy ? "Publishing…" : "Publish jam"}
            </button>
          </div>
        }
      />
    );
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          This is a preview — your jam hasn't been published yet.
        </div>
        <JamSplit aside={<JamPoster jam={previewJam} />}>{card}</JamSplit>
        <JamMap jam={previewJam} />
        {status && <p className="text-sm text-red-600">{status}</p>}
      </div>
    );
  }

  // Laid out like the event page: the image on the left, then the fields in
  // the order the page shows them, so the host fills in each thing where it
  // will appear.
  return (
    <JamSplit aside={<EventImageEditor images={images} />}>
      <div className="space-y-5">
        {/* Visibility */}
        <div>
          <Label text="Who can see this?" />
          {privateOnly && <p className="mt-1 text-xs text-amber-700">Local dev: new jams are always private</p>}
          <div className="mt-1.5 flex flex-col gap-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="radio" name="visibility" value="community" checked={visibility === "community"} onChange={() => setVisibility("community")} disabled={privateOnly} className="mt-0.5" />
              <div>
                <span className="text-sm font-medium">Community jam</span>
                <p className="text-xs text-zinc-500">Visible to all SingJam members</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="radio" name="visibility" value="private" checked={visibility === "private"} onChange={() => setVisibility("private")} className="mt-0.5" />
              <div>
                <span className="text-sm font-medium">Private jam</span>
                <p className="text-xs text-zinc-500">Only visible to people you invite</p>
              </div>
            </label>
            {canPostOfficial && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="visibility" value="official" checked={visibility === "official"} onChange={() => setVisibility("official")} disabled={privateOnly} className="mt-0.5" />
                <div>
                  <span className="text-sm font-medium text-amber-600">Official SingJam event</span>
                  <p className="text-xs text-zinc-500">Public — visible to anyone on the site</p>
                </div>
              </label>
            )}
          </div>
        </div>

        {/* Guests can invite — private and community jams */}
        {(visibility === "private" || visibility === "community") && (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={guestsCanInvite}
              onChange={(e) => setGuestsCanInvite(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <div>
              <span className="text-sm font-medium">Allow attendees to invite others</span>
              <p className="text-xs text-zinc-500">Guests can invite people directly from the jam page</p>
            </div>
          </label>
        )}

        {/* Name */}
        <div>
          <Label text="Event name" optional={!isOfficial} required={isOfficial} />
          <input
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-2xl font-bold text-zinc-900"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isOfficial ? "e.g. SingJam Open Circle — April" : `Defaults to "${defaultName}"`}
          />
        </div>

        {/* Date and time */}
        <div className="space-y-2">
          <Label text="Date" required />
          <input
            className="w-full appearance-none rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">
                Start time <span className="text-red-500">*</span>
              </label>
              <input className="w-full appearance-none rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                End time <span className="ml-1 text-xs font-normal text-zinc-400">optional</span>
              </label>
              <input className="w-full appearance-none rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <JamTimezoneNote timezone={timezone} resolving={resolvingTimezone} startsAt={toIso(date, startTime)} />
        </div>

        {/* Location */}
        <div>
          <div className="flex items-center justify-between">
            <Label text={isOfficial ? "Venue / address" : "Location"} required={!locationTbd} />
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={locationTbd}
                onChange={(e) => {
                  setLocationTbd(e.target.checked);
                  if (e.target.checked) setLocation({ fullAddress: "", neighborhood: "" });
                }}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-zinc-500">TBD</span>
            </label>
          </div>
          {!isOfficial && !locationTbd && (
            <p className="text-xs text-zinc-400 mt-0.5 mb-1">Exact address is only shared with people who RSVP</p>
          )}
          {!locationTbd && (
            <LocationAutocomplete
              value={location.fullAddress}
              onChange={setLocation}
              placeholder={isOfficial ? "e.g. Freight & Salvage, Berkeley" : "e.g. Cedar Rose Park, Berkeley"}
            />
          )}
        </div>

        {/* Capacity */}
        <div>
          <Label text="Capacity" optional />
          <input
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="Leave blank for unlimited"
          />
        </div>

        {isOfficial && (
          <div>
            <Label text="Tickets URL" optional />
            <input
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
              type="url"
              value={ticketsUrl}
              onChange={(e) => setTicketsUrl(e.target.value)}
              placeholder="https://humanitix.com/…"
            />
          </div>
        )}

        <TagCombobox label="Genres" options={genres} selected={selectedGenres} onChange={setSelectedGenres} placeholder="Search genres…" optional />
        <TagCombobox label="Themes" options={themes} selected={selectedThemes} onChange={setSelectedThemes} placeholder="Search themes…" optional />

        {/* Description */}
        <div>
          <Label text="About" optional />
          <textarea
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Vibe, what to bring, skill level, etc."
          />
        </div>

        {errors.length > 0 && (
          <ul className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-1">
            {errors.map((e) => <li key={e} className="text-sm text-red-600">{e}</li>)}
          </ul>
        )}

        <button
          onClick={goToPreview}
          disabled={resolvingTimezone || !timezone}
          className="w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          Preview
        </button>
      </div>
    </JamSplit>
  );
}
