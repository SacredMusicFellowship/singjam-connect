// Event images come in three crops, one per place they are shown. Each is
// baked into its own file when the event is saved; until then (and for events
// made before crops existed) a slot shows image_url cropped around the focal
// point.

export type JamImageSlot = "desktop" | "mobile" | "list";

export const JAM_IMAGE_SLOTS: Record<JamImageSlot, { label: string; aspect: number; width: number }> = {
  desktop: { label: "Desktop", aspect: 1, width: 1080 },
  mobile: { label: "Mobile", aspect: 3 / 2, width: 1200 },
  list: { label: "List", aspect: 1, width: 400 },
};

export const JAM_IMAGE_SLOT_KEYS = Object.keys(JAM_IMAGE_SLOTS) as JamImageSlot[];

/** A crop rectangle, as fractions of the source image's width and height. */
export type CropRect = { x: number; y: number; w: number; h: number };

/** A slot's crop, and which image it is cut from: null is the event's main image. */
export type SlotCrop = CropRect & { src: string | null };

export type JamImageCrops = Partial<Record<JamImageSlot, SlotCrop>>;

type JamImageFields = {
  image_url: string | null;
  image_focal_point?: string | null;
  image_desktop_url?: string | null;
  image_mobile_url?: string | null;
  image_list_url?: string | null;
};

/**
 * What to draw for a slot: its baked crop, already the right shape, or the
 * main image to be cover-cropped around the focal point.
 */
export function jamImageFor(jam: JamImageFields, slot: JamImageSlot): { src: string; position: string } | null {
  const baked = jam[`image_${slot}_url`];
  if (baked) return { src: baked, position: "50% 50%" };
  if (!jam.image_url) return null;
  return { src: jam.image_url, position: jam.image_focal_point ?? "50% 50%" };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The crop's width and height at zoom 1: as large as the slot shape allows. */
function fullSize(imgW: number, imgH: number, aspect: number) {
  return imgW / imgH > aspect
    ? { w: (imgH * aspect) / imgW, h: 1 }
    : { w: 1, h: imgW / aspect / imgH };
}

function parseFocal(focal: string | null | undefined) {
  const [x, y] = (focal ?? "50% 50%").split(" ").map((s) => parseFloat(s) / 100);
  return { fx: Number.isFinite(x) ? clamp(x, 0, 1) : 0.5, fy: Number.isFinite(y) ? clamp(y, 0, 1) : 0.5 };
}

/**
 * The largest crop of the slot's shape, placed the way CSS object-position
 * places a cover-fitted image, so an untouched slot bakes to exactly what the
 * focal-point fallback already shows.
 */
export function defaultCrop(imgW: number, imgH: number, aspect: number, focal?: string | null): CropRect {
  const { w, h } = fullSize(imgW, imgH, aspect);
  const { fx, fy } = parseFocal(focal);
  return { x: (1 - w) * fx, y: (1 - h) * fy, w, h };
}

/** How far in a crop is zoomed: 1 is the largest crop the shape allows. */
export function cropZoom(crop: CropRect, imgW: number, imgH: number, aspect: number): number {
  return fullSize(imgW, imgH, aspect).w / crop.w;
}

/** Zoom about the crop's centre, keeping it inside the image. */
export function zoomCrop(crop: CropRect, imgW: number, imgH: number, aspect: number, zoom: number): CropRect {
  const full = fullSize(imgW, imgH, aspect);
  const z = Math.max(1, zoom);
  const w = full.w / z;
  const h = full.h / z;
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
}

/** Move a crop by a fraction of the image, keeping it inside the image. */
export function panCrop(crop: CropRect, dx: number, dy: number): CropRect {
  return { ...crop, x: clamp(crop.x + dx, 0, 1 - crop.w), y: clamp(crop.y + dy, 0, 1 - crop.h) };
}
