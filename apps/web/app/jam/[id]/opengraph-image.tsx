import { ImageResponse } from "next/og";
import sizeOf from "image-size";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveJamId } from "@/lib/shortRef";
import { BrandMark, getBrandOgImageOptions } from "@/lib/og-image";

export const alt = "Jam on SingJam";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { id: string } }) {
  // Crawlers arrive with no session, and metadata image routes never receive
  // the ?invite= token, so an RLS-scoped read hides every private jam's photo
  // behind the logo fallback. Read as admin: the photo it points at already
  // lives in the public jam-images bucket, so the jam id is the only secret
  // involved and the sharer is handing that out with the link.
  const id = await resolveJamId(params.id);
  const { data } = id
    ? await supabaseAdmin().from("jams").select("image_url").eq("id", id).maybeSingle()
    : { data: null };

  const imageUrl = (data as any)?.image_url ?? null;

  if (imageUrl) {
    const photo = await topCroppedPhoto(imageUrl);
    if (photo) return new ImageResponse(photo, size);
  }

  return new ImageResponse(<BrandMark />, await getBrandOgImageOptions(size));
}

const SUPPORTED_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg" };

// Cover the card with the photo, anchored to its top. Event posters put the
// name at the top, and Satori ignores objectPosition — it always crops from the
// centre — so the photo is scaled and placed by hand from its real dimensions.
// Satori only draws PNG and JPEG; anything else (WebP uploads) rendered as a
// blank white card, so those get the logo instead.
async function topCroppedPhoto(url: string) {
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

  const scale = Math.max(size.width / dims.width, size.height / dims.height);
  const width = Math.ceil(dims.width * scale);
  const height = Math.ceil(dims.height * scale);

  return (
    <div style={{ width: size.width, height: size.height, display: "flex", position: "relative", overflow: "hidden" }}>
      <img
        src={`data:${SUPPORTED_TYPES[dims.type!]};base64,${bytes.toString("base64")}`}
        width={width}
        height={height}
        style={{ position: "absolute", top: 0, left: Math.round((size.width - width) / 2), width, height }}
      />
    </div>
  );
}
