"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultCrop,
  JAM_IMAGE_SLOT_KEYS,
  JAM_IMAGE_SLOTS,
  type CropRect,
  type JamImageCrops,
  type JamImageSlot,
} from "@singjam/core";

export type JamImageFields = {
  image_url: string | null;
  image_focal_point: string | null;
  image_desktop_url: string | null;
  image_mobile_url: string | null;
  image_list_url: string | null;
  image_crops: JamImageCrops | null;
};

type Baked = Record<JamImageSlot, { blob: Blob; url: string; rect: CropRect }>;

function slotRecord<T>(fn: (slot: JamImageSlot) => T): Record<JamImageSlot, T> {
  return Object.fromEntries(JAM_IMAGE_SLOT_KEYS.map((s) => [s, fn(s)])) as Record<JamImageSlot, T>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Stored images come from the Supabase bucket, so the canvas they are
    // drawn into is only readable if they are fetched with CORS.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image."));
    img.src = src;
  });
}

async function bakeSlot(src: string, slot: JamImageSlot, rect: CropRect | undefined, focal: string) {
  const img = await loadImage(src);
  const { aspect, width } = JAM_IMAGE_SLOTS[slot];
  const r = rect ?? defaultCrop(img.naturalWidth, img.naturalHeight, aspect, focal);
  const sw = r.w * img.naturalWidth;
  const sh = r.h * img.naturalHeight;
  const outW = Math.max(1, Math.round(Math.min(width, sw)));
  const outH = Math.max(1, Math.round(outW / aspect));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  // JPEG has no transparency, which would otherwise turn black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, r.x * img.naturalWidth, r.y * img.naturalHeight, sw, sh, 0, 0, outW, outH);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Could not crop the image.");
  return { blob, url: URL.createObjectURL(blob), rect: r };
}

/**
 * The event image and its three crops while an event is being edited. Crops
 * are baked into files on Preview, so the preview shows exactly what will be
 * saved, and uploaded on save. Nothing image-related is re-uploaded unless the
 * host changed something.
 */
export function useJamImages(initial?: Partial<JamImageFields> | null) {
  const [main, setMain] = useState<string | null>(initial?.image_url ?? null);
  const [focal, setFocal] = useState(initial?.image_focal_point ?? "50% 50%");
  const [srcs, setSrcs] = useState(() => slotRecord((s) => initial?.image_crops?.[s]?.src ?? null));
  const [rects, setRects] = useState<Partial<Record<JamImageSlot, CropRect>>>(() => {
    const crops = initial?.image_crops ?? {};
    return Object.fromEntries(
      Object.entries(crops).map(([slot, c]) => [slot, { x: c!.x, y: c!.y, w: c!.w, h: c!.h }])
    );
  });
  const [version, setVersion] = useState(0);
  const files = useRef(new Map<string, File>());
  const baked = useRef<{ version: number; result: Baked } | null>(null);
  // A save that fails after uploading is retried with the same files.
  const committed = useRef<{ version: number; fields: JamImageFields } | null>(null);

  const dirty = version > 0;
  const touch = () => setVersion((v) => v + 1);

  function fileUrl(file: File) {
    const url = URL.createObjectURL(file);
    files.current.set(url, file);
    return url;
  }

  const slotSrc = (slot: JamImageSlot) => srcs[slot] ?? main;
  // A slot's own image has no focal point, so its default crop is centred.
  const slotFocal = (slot: JamImageSlot) => (srcs[slot] ? "50% 50%" : focal);

  function chooseMain(file: File) {
    setMain(fileUrl(file));
    setFocal("50% 50%");
    setRects((prev) => Object.fromEntries(Object.entries(prev).filter(([s]) => srcs[s as JamImageSlot])));
    touch();
  }

  function removeMain() {
    setMain(null);
    setSrcs(slotRecord(() => null));
    setRects({});
    touch();
  }

  function chooseSlotImage(slot: JamImageSlot, file: File) {
    setSrcs((prev) => ({ ...prev, [slot]: fileUrl(file) }));
    setRects(({ [slot]: _, ...rest }) => rest);
    touch();
  }

  function revertToMain(slot: JamImageSlot) {
    setSrcs((prev) => ({ ...prev, [slot]: null }));
    setRects(({ [slot]: _, ...rest }) => rest);
    touch();
  }

  function setRect(slot: JamImageSlot, rect: CropRect) {
    setRects((prev) => ({ ...prev, [slot]: rect }));
    touch();
  }

  async function bake(): Promise<Baked> {
    if (baked.current?.version === version) return baked.current.result;
    for (const b of Object.values(baked.current?.result ?? {})) URL.revokeObjectURL(b.url);
    const entries = await Promise.all(
      JAM_IMAGE_SLOT_KEYS.map(async (s) => [s, await bakeSlot(slotSrc(s)!, s, rects[s], slotFocal(s))] as const)
    );
    const result = Object.fromEntries(entries) as Baked;
    baked.current = { version, result };
    return result;
  }

  /** The fields to render a preview with: the unsaved crops as local files. */
  async function previewFields(): Promise<JamImageFields> {
    if (!dirty) return toFields(initial);
    if (!main) return toFields(null);
    const b = await bake();
    return {
      image_url: main,
      image_focal_point: focal,
      image_desktop_url: b.desktop.url,
      image_mobile_url: b.mobile.url,
      image_list_url: b.list.url,
      image_crops: null,
    };
  }

  /** Uploads whatever is new and returns the fields to save. */
  async function commit(supabase: SupabaseClient, uid: string): Promise<JamImageFields> {
    if (!dirty) return toFields(initial);
    if (!main) return toFields(null);
    if (committed.current?.version === version) return committed.current.fields;
    const b = await bake();
    const stamp = Date.now();

    async function upload(body: Blob, name: string, contentType: string | undefined) {
      const path = `${uid}-${stamp}-${name}`;
      const { error } = await supabase.storage.from("jam-images").upload(path, body, { upsert: false, contentType });
      if (error) throw new Error(`Image upload failed: ${error.message}`);
      return supabase.storage.from("jam-images").getPublicUrl(path).data.publicUrl;
    }
    // A picked file is still a blob: URL until it is uploaded; anything else
    // is already stored.
    async function stored(src: string, name: string) {
      const file = files.current.get(src);
      if (!file) return src;
      // A file accepted by its name alone can report no type; let storage infer it.
      return upload(file, `${name}.${file.name.split(".").pop()}`, file.type || undefined);
    }

    const [imageUrl, ...rest] = await Promise.all([
      stored(main, "main"),
      ...JAM_IMAGE_SLOT_KEYS.map((s) => (srcs[s] ? stored(srcs[s]!, `${s}-source`) : Promise.resolve(null))),
      ...JAM_IMAGE_SLOT_KEYS.map((s) => upload(b[s].blob, `${s}.jpg`, "image/jpeg")),
    ]);
    const slotSources = slotRecord((s) => rest[JAM_IMAGE_SLOT_KEYS.indexOf(s)]);
    const bakedUrls = slotRecord((s) => rest[JAM_IMAGE_SLOT_KEYS.length + JAM_IMAGE_SLOT_KEYS.indexOf(s)]);

    const fields = {
      image_url: imageUrl,
      image_focal_point: focal,
      image_desktop_url: bakedUrls.desktop,
      image_mobile_url: bakedUrls.mobile,
      image_list_url: bakedUrls.list,
      image_crops: slotRecord((s) => ({ src: slotSources[s], ...b[s].rect })),
    };
    committed.current = { version, fields };
    return fields;
  }

  return {
    main,
    slotSrc,
    slotFocal,
    hasOwnImage: (slot: JamImageSlot) => !!srcs[slot],
    rects,
    dirty,
    chooseMain,
    removeMain,
    chooseSlotImage,
    revertToMain,
    setRect,
    previewFields,
    commit,
  };
}

export type JamImages = ReturnType<typeof useJamImages>;

function toFields(f: Partial<JamImageFields> | null | undefined): JamImageFields {
  return {
    image_url: f?.image_url ?? null,
    image_focal_point: f?.image_url ? f.image_focal_point ?? "50% 50%" : null,
    image_desktop_url: f?.image_desktop_url ?? null,
    image_mobile_url: f?.image_mobile_url ?? null,
    image_list_url: f?.image_list_url ?? null,
    image_crops: f?.image_crops ?? null,
  };
}
