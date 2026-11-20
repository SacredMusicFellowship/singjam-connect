"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import LocationAutocomplete from "./LocationAutocomplete";
import { USERNAME_REGEX, RESERVED_USERNAMES, normalizeUsername, suggestUsername } from "@singjam/core";

const SEEDED_INSTRUMENTS = [
  "Guitar", "Electric Bass", "Upright Bass", "Piano/Keys", "Drums", "Percussion", "Violin/Fiddle", "Viola", "Cello",
  "Banjo", "Mandolin", "Ukulele", "Flute", "Clarinet", "Saxophone",
  "Trumpet", "Trombone", "Harmonica", "Accordion", "Harp", "Dobro",
  "Pedal Steel", "Organ", "Synthesizer",
  "Sitar", "Tabla", "Harmonium", "Sarod", "Bansuri", "Veena", "Mridangam", "Sarangi", "Tanpura", "Dholak",
  "Oud", "Darbuka", "Qanun", "Ney", "Riq", "Rebab", "Buzuq",
  "Djembe", "Kora", "Mbira", "Balafon", "Kalimba", "Talking Drum", "Ngoni", "Shekere", "Dundun",
  "Erhu", "Guzheng", "Pipa", "Shamisen", "Koto", "Shakuhachi", "Gayageum", "Dizi", "Taiko",
  "Other",
];
const INSTRUMENT_LEVELS = ["Beginner", "Intermediate", "Advanced", "Professional"] as const;
const SINGING_OPTIONS = [
  { value: "lead", label: "Lead vocals" },
  { value: "backup", label: "Backup vocals" },
  { value: "none", label: "I don't sing" },
] as const;
type SingingVoice = string[];

const FEATURED_INSTRUMENTS = ["Guitar", "Piano/Keys", "Electric Bass", "Upright Bass", "Drums", "Percussion", "Violin/Fiddle", "Cello", "Saxophone", "Clarinet", "Trumpet"];

function InstrumentSearch({
  seeded,
  added,
  onSelect,
}: {
  seeded: string[];
  added: Record<string, string>;
  onSelect: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const available = seeded.filter((i) => !added[i]);
  const trimmed = q.trim();
  const filtered = trimmed
    ? available.filter((i) => i.toLowerCase().includes(trimmed.toLowerCase()))
    : [];
  const featured = FEATURED_INSTRUMENTS.filter((i) => !added[i]);

  return (
    <div className="relative mt-2">
      {featured.length > 0 && !trimmed && (
        <div className="mb-2 flex flex-wrap gap-2">
          {featured.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              + {i}
            </button>
          ))}
        </div>
      )}
      <input
        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
        placeholder="Search all instruments…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-md overflow-hidden">
          {filtered.map((i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(i); setQ(""); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
            >
              {i}
            </button>
          ))}
        </div>
      )}
      {trimmed && filtered.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-400 shadow-md">
          No matches
        </div>
      )}
    </div>
  );
}

function GenreSearch({
  allGenres,
  selected,
  topGenres,
  onToggle,
}: {
  allGenres: string[];
  selected: string[];
  topGenres: string[];
  onToggle: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const trimmed = q.trim();
  const available = allGenres.filter((g) => !selected.includes(g));
  const filtered = trimmed
    ? available.filter((g) => g.toLowerCase().includes(trimmed.toLowerCase()))
    : [];

  return (
    <div className="relative mt-2">
      {topGenres.length > 0 && !trimmed && (
        <div className="mb-2 flex flex-wrap gap-2">
          {topGenres.map((g) => {
            const isSelected = selected.includes(g);
            return (
              <button key={g} type="button" onClick={() => onToggle(g)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${isSelected ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-200 hover:bg-zinc-50"}`}>
                {isSelected ? `✓ ${g}` : `+ ${g}`}
              </button>
            );
          })}
        </div>
      )}
      <input
        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
        placeholder="Search all genres…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-md overflow-hidden">
          {filtered.map((g) => (
            <button key={g} type="button"
              onMouseDown={(e) => { e.preventDefault(); onToggle(g); setQ(""); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50">
              {g}
            </button>
          ))}
        </div>
      )}
      {trimmed && filtered.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-400 shadow-md">
          No matches
        </div>
      )}
    </div>
  );
}

export default function AccountPanel() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  const next = rawNext && /^\/[^/]/.test(rawNext) ? rawNext : undefined;
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [neighborhood, setNeighborhood] = useState("");
  const [locationConfirmed, setLocationConfirmed] = useState(true);
  const [singingVoice, setSingingVoice] = useState<SingingVoice>([]);
  const [instrumentLevels, setInstrumentLevels] = useState<Record<string, string>>({});
  const [pendingInstrument, setPendingInstrument] = useState<string | null>(null);
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
  const [allGenres, setAllGenres] = useState<string[]>([]);

  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const usernameTimerRef = useRef<number | null>(null);
  const originalUsername = useRef<string>("");

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [draggingOver, setDraggingOver] = useState(false);

  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      setEmail(data.user.email ?? null);
      Promise.all([
        supabase.from("profiles").select("display_name, last_name, username, avatar_url, neighborhood, singing_voice, instrument_levels, favorite_genres, role").eq("id", data.user.id).single(),
        supabase.rpc("genres_by_usage"),
      ]).then(([{ data: profile }, { data: genreRows }]) => {
        const favorites: string[] = (profile as any)?.favorite_genres ?? [];

        const meta = data.user.user_metadata ?? {};
        const fullName: string = meta.full_name ?? meta.name ?? "";
        const spaceIdx = fullName.indexOf(" ");
        const metaFirst = spaceIdx > -1 ? fullName.slice(0, spaceIdx) : fullName;
        const metaLast = spaceIdx > -1 ? fullName.slice(spaceIdx + 1) : "";
        setName(profile?.display_name ?? metaFirst);
        setLastName(profile?.last_name ?? metaLast);
        setAvatarUrl(profile?.avatar_url ?? meta.avatar_url ?? null);
        setNeighborhood(profile?.neighborhood ?? "");
        setLocationConfirmed(true);
        setSingingVoice(profile?.singing_voice ? profile.singing_voice.split(",") : []);
        setInstrumentLevels((profile?.instrument_levels as Record<string, string>) ?? {});
        setFavoriteGenres(profile?.favorite_genres ?? []);
        setIsAdmin((profile as any)?.role === "admin");

        const savedUsername = profile?.username ?? "";
        if (savedUsername) {
          setUsername(savedUsername);
          originalUsername.current = savedUsername;
        } else if (data.user.email) {
          setUsername(suggestUsername(data.user.email));
        }

        if (genreRows) {
          setAllGenres((genreRows as { name: string }[]).map((r) => r.name));
        }

        setLoading(false);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUsernameChange(val: string) {
    const lower = normalizeUsername(val);
    setUsername(lower);

    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);

    if (!lower || lower === originalUsername.current) {
      setUsernameStatus("idle");
      return;
    }

    if (!USERNAME_REGEX.test(lower) || RESERVED_USERNAMES.has(lower)) {
      setUsernameStatus("invalid");
      return;
    }

    setUsernameStatus("checking");
    usernameTimerRef.current = window.setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", lower)
        .neq("id", userId ?? "")
        .maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 400);
  }

  async function uploadAvatar(file: File) {
    if (!userId) return;

    if (file.size > 5 * 1024 * 1024) {
      setStatus("Avatar must be under 5 MB.");
      return;
    }

    setUploadingAvatar(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setStatus("Avatar upload failed: " + uploadError.message);
      setUploadingAvatar(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    if (updateError) {
      setStatus("Failed to save avatar.");
    } else {
      setAvatarUrl(publicUrl + `?t=${Date.now()}`);
      window.dispatchEvent(new CustomEvent("profile-updated"));
    }
    setUploadingAvatar(false);
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadAvatar(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) uploadAvatar(file);
  }

  async function save() {
    if (!username.trim()) {
      setStatus("A username is required.");
      return;
    }
    if (usernameStatus === "taken" || usernameStatus === "invalid") {
      setStatus("Please fix your username before saving.");
      return;
    }

    setBusy(true);
    setStatus(null);

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setBusy(false); setStatus("Not signed in."); return; }

    await fetch("/api/account/update-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: [name, lastName].filter(Boolean).join(" ") || null }),
    });

    let resolvedNeighborhood = neighborhood || null;
    if (neighborhood && locationConfirmed === false) {
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
      if (key) {
        try {
          let locationBias: object | undefined;
          const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
            if (!navigator.geolocation) { resolve(null); return; }
            const timer = setTimeout(() => resolve(null), 3000);
            navigator.geolocation.getCurrentPosition(
              (pos) => { clearTimeout(timer); resolve(pos.coords); },
              () => { clearTimeout(timer); resolve(null); },
            );
          });
          if (coords) {
            locationBias = {
              circle: {
                center: { latitude: coords.latitude, longitude: coords.longitude },
                radius: 150000,
              },
            };
          }

          const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
            body: JSON.stringify({
              input: neighborhood,
              includedPrimaryTypes: ["locality", "sublocality"],
              ...(locationBias && { locationBias }),
            }),
          });
          const json = await res.json();
          const top = json.suggestions?.[0]?.placePrediction?.structuredFormat;
          if (top) {
            const main = top.mainText.text as string;
            const secondary = top.secondaryText?.text as string | undefined;
            resolvedNeighborhood = secondary ? `${main}, ${secondary.split(", ")[0]}` : main;
            setNeighborhood(resolvedNeighborhood);
            setLocationConfirmed(true);
          }
        } catch {
          // fall through with raw value
        }
      }
    }

    const { error } = await supabase.from("profiles").upsert({
      id: uid,
      display_name: name || null,
      last_name: lastName || null,
      username: username || null,
      neighborhood: resolvedNeighborhood,
      singing_voice: singingVoice.length ? singingVoice.join(",") : null,
      instrument_levels: instrumentLevels,
      favorite_genres: favoriteGenres.length ? favoriteGenres : null,
      updated_at: new Date().toISOString(),
    });

    setBusy(false);
    if (!error) {
      originalUsername.current = username;
      setUsernameStatus("idle");
      window.dispatchEvent(new CustomEvent("profile-updated"));
      // Syncs to ActiveCampaign and sends the welcome email — this is the only
      // trigger for it, so don't drop the call.
      fetch("/api/account/sync-ac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: name || undefined,
          lastName: lastName || undefined,
          neighborhood: resolvedNeighborhood || undefined,
          singingVoice,
          instrumentLevels,
          favoriteGenres,
        }),
      }).catch(() => {});
    }
    if (!error) router.push(next ?? "/profile");
    else setStatus(error.message);
  }

  async function changeEmail() {
    if (!newEmail.trim()) return;
    setEmailBusy(true);
    setEmailStatus(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailBusy(false);
    if (error) {
      setEmailStatus(error.message);
    } else {
      setEmailStatus(`Confirmation sent to ${newEmail.trim()}. Click the link to complete the change.`);
      setChangingEmail(false);
      setNewEmail("");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function deleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    const res = await fetch("/api/account/delete", { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setStatus(body.error ?? "Failed to delete account.");
      setDeleting(false);
      return;
    }
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm space-y-5">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-zinc-200" />
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
              <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-20 animate-pulse rounded bg-zinc-200" />
              <div className="h-9 animate-pulse rounded-xl bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm space-y-5">

        {/* Avatar */}
        <div
          className={`flex items-center gap-4 rounded-xl border-2 border-dashed p-3 transition-colors ${draggingOver ? "border-amber-400 bg-amber-50" : "border-transparent"}`}
          onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
          onDragLeave={() => setDraggingOver(false)}
          onDrop={handleDrop}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 hover:opacity-80 transition-opacity"
            title="Change photo"
          >
            {avatarUrl ? (
              <Image src={avatarUrl} alt="Avatar" fill sizes="64px" className="object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl text-zinc-400">
                {name?.[0]?.toUpperCase() ?? "?"}
              </span>
            )}
            {uploadingAvatar && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">
                Uploading…
              </span>
            )}
          </button>
          <div>
            <div className="text-sm font-medium">Profile photo</div>
            <div className="text-xs text-zinc-500">
              <span className="hidden sm:inline">Click to upload or drag and drop · JPG, PNG, WebP · </span>
              <span className="sm:hidden">Tap to upload · </span>
              max 5 MB
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        {/* Email */}
        {email && (
          <div>
            <label className="block text-sm font-medium">Email</label>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">{email}</div>
              <button
                type="button"
                onClick={() => { setChangingEmail((v) => !v); setEmailStatus(null); setNewEmail(""); }}
                className="shrink-0 rounded-full border border-zinc-200 px-3 py-2 text-xs hover:bg-zinc-50"
              >
                Change
              </button>
            </div>
            {changingEmail && (
              <div className="mt-2 space-y-2">
                <input
                  type="email"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="New email address"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={changeEmail}
                    disabled={!newEmail.trim() || emailBusy}
                    className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {emailBusy ? "Sending…" : "Send confirmation"}
                  </button>
                  <button
                    onClick={() => { setChangingEmail(false); setNewEmail(""); setEmailStatus(null); }}
                    className="rounded-full border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {emailStatus && <div className="mt-1 text-xs text-zinc-500">{emailStatus}</div>}
          </div>
        )}

        {/* Name */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">First name</label>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Last name</label>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
            />
          </div>
        </div>

        {/* Username */}
        <div>
          <label className="block text-sm font-medium">Username</label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">@</span>
            <input
              className="w-full rounded-xl border border-zinc-300 pl-7 pr-8 py-2 text-sm"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="jamfan"
              maxLength={20}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
              {usernameStatus === "checking" && <span className="text-zinc-400">…</span>}
              {usernameStatus === "available" && <span className="text-emerald-500">✓</span>}
              {(usernameStatus === "taken" || usernameStatus === "invalid") && <span className="text-red-500">✗</span>}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {usernameStatus === "invalid"
              ? "3–20 characters, letters, numbers and underscores only."
              : usernameStatus === "taken"
              ? "That username is already taken."
              : "3–20 characters · letters, numbers, underscores"}
          </div>
        </div>

        {/* Neighborhood */}
        <div>
          <label className="block text-sm font-medium">City</label>
          <div className="mt-1">
            <LocationAutocomplete
              citiesOnly
              value={neighborhood}
              onChange={(loc) => { setNeighborhood(loc.neighborhood); setLocationConfirmed(loc.confirmed ?? true); }}
              placeholder="City"
            />
          </div>
          <div className="mt-1 text-xs text-zinc-500">Only your city is shown, never a street address.</div>
        </div>

        {/* Singing voice */}
        <div>
          <div className="text-sm font-medium">Singing</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {SINGING_OPTIONS.map((o) => {
              const selected = singingVoice.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    if (o.value === "none") {
                      setSingingVoice(selected ? [] : ["none"]);
                    } else {
                      setSingingVoice(selected
                        ? singingVoice.filter((v) => v !== o.value)
                        : [...singingVoice.filter((v) => v !== "none"), o.value]
                      );
                    }
                  }}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${selected ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-200 hover:bg-zinc-50"}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Instruments */}
        <div>
          <div className="text-sm font-medium">Instruments</div>

          {/* Pills for added instruments */}
          {Object.keys(instrumentLevels).length > 0 && (
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">You play</div>
              <div className="flex flex-wrap gap-2">
              {Object.entries(instrumentLevels).sort(([aName, aLevel], [bName, bLevel]) => {
                const order = INSTRUMENT_LEVELS.slice().reverse();
                const diff = order.indexOf(aLevel as typeof INSTRUMENT_LEVELS[number]) - order.indexOf(bLevel as typeof INSTRUMENT_LEVELS[number]);
                return diff !== 0 ? diff : aName.localeCompare(bName);
              }).map(([name, level]) => (
                <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 pl-3 pr-1 py-1 text-sm text-zinc-700">
                  <span className="font-medium">{name}</span>
                  <select
                    value={level}
                    onChange={(e) => setInstrumentLevels({ ...instrumentLevels, [name]: e.target.value })}
                    className="rounded-xl border-0 bg-transparent text-xs text-zinc-500 focus:outline-none cursor-pointer"
                  >
                    {INSTRUMENT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...instrumentLevels };
                      delete next[name];
                      setInstrumentLevels(next);
                    }}
                    className="text-zinc-400 hover:text-zinc-700 leading-none px-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            </div>
          )}

          {/* Pending level pick */}
          {pendingInstrument && (
            <div className="mt-3 rounded-2xl border border-indigo-300 bg-indigo-50 p-4 space-y-2.5 animate-attention-pop">
              <p className="text-sm font-semibold text-indigo-900">
                How well do you play <span className="font-bold">{pendingInstrument}</span>?
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {INSTRUMENT_LEVELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      setInstrumentLevels({ ...instrumentLevels, [pendingInstrument]: l });
                      setPendingInstrument(null);
                    }}
                    className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-indigo-100"
                  >
                    {l}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPendingInstrument(null)}
                  className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-sm text-zinc-500 hover:bg-indigo-100"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Add instruments */}
          {!pendingInstrument && (
            <div className="mt-3 rounded-xl border border-dashed border-zinc-200 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Add an instrument</div>
              <InstrumentSearch
                seeded={SEEDED_INSTRUMENTS}
                added={instrumentLevels}
                onSelect={setPendingInstrument}
              />
            </div>
          )}
        </div>

        {/* Favorite genres */}
        <div>
          <div className="text-sm font-medium">Favorite genres</div>

          {favoriteGenres.length > 0 && (
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Your genres</div>
              <div className="flex flex-wrap gap-2">
                {favoriteGenres.slice().sort((a, b) => a.localeCompare(b)).map((g) => (
                  <span key={g} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 pl-3 pr-1 py-1 text-sm text-zinc-700">
                    <span className="font-medium">{g}</span>
                    <button type="button"
                      onClick={() => setFavoriteGenres(favoriteGenres.filter((x) => x !== g))}
                      className="text-zinc-400 hover:text-zinc-700 leading-none px-1">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-xl border border-dashed border-zinc-200 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Add a genre</div>
            <GenreSearch
              allGenres={allGenres}
              selected={favoriteGenres}
              topGenres={allGenres.filter(g => !favoriteGenres.includes(g)).slice(0, 10)}
              onToggle={(g) => setFavoriteGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])}
            />
          </div>
        </div>

        <button
          onClick={save}
          disabled={busy}
          className="w-full rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save"}
        </button>
        {status && <div className="text-sm text-zinc-600">{status}</div>}
      </div>

      {/* Sign out */}
      <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm flex items-center gap-3">
        <button onClick={signOut} className="rounded-full border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50">
          Sign out
        </button>
        {isAdmin && (
          <Link
            href="/admin/songs"
            className="rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-200 transition-colors"
          >
            Admin panel
          </Link>
        )}
      </div>

      {/* Delete account */}
      <div className="rounded-2xl border border-red-200 p-5 shadow-sm">
        <div className="text-sm font-medium text-red-700">Delete account</div>
        <div className="mt-1 text-xs text-zinc-500">
          Permanently deletes your account and all your data. This cannot be undone.
        </div>
        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="mt-3 rounded-full border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Delete my account
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-zinc-600">Type <strong>DELETE</strong> to confirm:</div>
            <input
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
            />
            <div className="flex gap-2">
              <button
                onClick={deleteAccount}
                disabled={deleteConfirm !== "DELETE" || deleting}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </button>
              <button
                onClick={() => { setShowDelete(false); setDeleteConfirm(""); }}
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
