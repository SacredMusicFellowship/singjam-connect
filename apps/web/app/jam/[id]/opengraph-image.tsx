import { ImageResponse } from "next/og";
import sizeOf from "image-size";
import { formatJamLongDate, formatJamTimeRange, jamImageFor, jamPreviewPlace } from "@singjam/core";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveJamId } from "@/lib/shortRef";
import { BrandMark, getBrandOgImageOptions, loadInterSubset } from "@/lib/og-image";

export const alt = "Jam on SingJam";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PANEL = size.height;

export default async function Image({ params }: { params: { id: string } }) {
  // Crawlers arrive with no session, and metadata image routes never receive
  // the ?invite= token, so an RLS-scoped read hides every private jam's photo
  // behind the logo fallback. Read as admin: the photo it points at already
  // lives in the public jam-images bucket, so the jam id is the only secret
  // involved and the sharer is handing that out with the link.
  const id = await resolveJamId(params.id);
  const { data } = id
    ? await supabaseAdmin()
        .from("jams")
        .select("name, visibility, starts_at, ends_at, timezone, neighborhood, full_address, image_url, image_focal_point, image_desktop_url")
        .eq("id", id)
        .maybeSingle()
    : { data: null };
  const jam = data as any;
  if (!jam) return new ImageResponse(<BrandMark />, await getBrandOgImageOptions(size));

  // The card always spells out when and where beside the image, since a crop
  // (or a poster with no details on it) can't be relied on to say so.
  const title = jam.name ?? (jam.visibility === "official" ? "SingJam event" : "Community jam");
  const date = formatJamLongDate(jam.starts_at, jam.timezone);
  const time = formatJamTimeRange(jam.starts_at, jam.ends_at, jam.timezone);
  const place = jamPreviewPlace(jam);

  // The square desktop crop fills the left half as is. An event without one
  // falls back to its main image, cropped from the top, where posters put the
  // name.
  const image = jamImageFor(jam, "desktop");
  const photo = image ? await squarePhoto(image.src, jam.image_desktop_url ? "center" : "top") : null;

  const text = [title, date, time, place, "SingJam"].filter(Boolean).join(" ");
  const [regular, bold] = await Promise.all([loadInterSubset(400, text), loadInterSubset(700, text)]);
  const fonts = [
    ...(regular ? [{ name: "Inter", data: regular, weight: 400 as const, style: "normal" as const }] : []),
    ...(bold ? [{ name: "Inter", data: bold, weight: 700 as const, style: "normal" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div style={{ width: size.width, height: size.height, display: "flex", background: "#ffffff", fontFamily: "Inter, sans-serif" }}>
        {photo ?? (
          <div style={{ width: PANEL, height: PANEL, display: "flex", alignItems: "center", justifyContent: "center", background: "#f59e0b" }}>
            <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={NOTE_PATH} />
            </svg>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px 56px" }}>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: "#18181b", lineHeight: 1.15, maxHeight: 160, overflow: "hidden" }}>
            {title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 36, gap: 22 }}>
            {date && <Row icon={CALENDAR_PATH} text={date} strong />}
            {time && <Row icon={CLOCK_PATH} text={time} />}
            {place && <Row icon={PIN_PATH} text={place} />}
          </div>
          <div style={{ display: "flex", marginTop: 40, fontSize: 26, fontWeight: 700, color: "#f59e0b" }}>SingJam</div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}

function Row({ icon, text, strong = false }: { icon: string; text: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2 }}>
        <path d={icon} />
      </svg>
      <div style={{ display: "flex", flex: 1, fontSize: 30, lineHeight: 1.25, fontWeight: strong ? 700 : 400, color: strong ? "#27272a" : "#52525b" }}>
        {text}
      </div>
    </div>
  );
}

const NOTE_PATH =
  "M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z";
const CALENDAR_PATH =
  "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5";
const CLOCK_PATH = "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z";
const PIN_PATH =
  "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z";

const SUPPORTED_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg" };

// Cover a square with the photo. Satori ignores objectPosition, so the photo
// is scaled and placed by hand from its real dimensions. Satori only draws PNG
// and JPEG; anything else (WebP uploads) rendered blank, so those get the
// plain panel instead.
async function squarePhoto(url: string, anchor: "top" | "center") {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  let dims: { width?: number; height?: number; type?: string };
  try {
    dims = sizeOf(bytes);
  } catch {
    return null;
  }
  if (!dims.width || !dims.height || !SUPPORTED_TYPES[dims.type ?? ""]) return null;

  const scale = Math.max(PANEL / dims.width, PANEL / dims.height);
  const width = Math.ceil(dims.width * scale);
  const height = Math.ceil(dims.height * scale);

  return (
    <div style={{ width: PANEL, height: PANEL, display: "flex", position: "relative", overflow: "hidden" }}>
      <img
        src={`data:${SUPPORTED_TYPES[dims.type!]};base64,${bytes.toString("base64")}`}
        width={width}
        height={height}
        style={{ position: "absolute", top: anchor === "top" ? 0 : Math.round((PANEL - height) / 2), left: Math.round((PANEL - width) / 2), width, height }}
      />
    </div>
  );
}
