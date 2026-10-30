"use client";

import { useRef, useState, type CSSProperties } from "react";
import {
  cropZoom,
  defaultCrop,
  JAM_IMAGE_SLOT_KEYS,
  JAM_IMAGE_SLOTS,
  JAM_IMAGE_TYPE_ERROR,
  JAM_IMAGE_TYPES,
  isJamImageType,
  panCrop,
  zoomCrop,
  type CropRect,
  type JamImageSlot,
} from "@singjam/core";
import type { JamImages } from "@/lib/useJamImages";

const ASPECT_CLASS: Record<JamImageSlot, string> = {
  desktop: "aspect-square",
  mobile: "aspect-[3/2]",
  list: "aspect-square",
};

const WHERE: Record<JamImageSlot, string> = {
  desktop: "Shown on the event page on a computer, and in link previews.",
  mobile: "Shown on the event page on a phone and in the app.",
  list: "Shown as the thumbnail in the jams list.",
};

const MAX_ZOOM = 4;

// Positions the whole image inside a frame of the crop's shape so that only
// the crop shows. Percentages of the frame, so it works at any size.
function cropStyle(r: CropRect): CSSProperties {
  return {
    width: `${100 / r.w}%`,
    height: `${100 / r.h}%`,
    left: `${(-r.x / r.w) * 100}%`,
    top: `${(-r.y / r.h) * 100}%`,
  };
}

function useCrop(slot: JamImageSlot, rect: CropRect | undefined, focal: string) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const r = rect ?? (dims ? defaultCrop(dims.w, dims.h, JAM_IMAGE_SLOTS[slot].aspect, focal) : null);
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) =>
    setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
  return { dims, r, onLoad };
}

function CropImage({ src, r, onLoad }: { src: string; r: CropRect | null; onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void }) {
  return (
    // crossOrigin matches the canvas load in useJamImages, so the browser
    // cache never hands the baker a copy fetched without CORS.
    <img
      key={src}
      src={src}
      alt=""
      crossOrigin="anonymous"
      draggable={false}
      onLoad={onLoad}
      className={`absolute max-w-none select-none ${r ? "" : "opacity-0"}`}
      style={r ? cropStyle(r) : undefined}
    />
  );
}

function CropThumb({ images, slot }: { images: JamImages; slot: JamImageSlot }) {
  const { r, onLoad } = useCrop(slot, images.rects[slot], images.slotFocal(slot));
  return (
    <div className={`relative h-12 overflow-hidden rounded-md bg-zinc-100 ${ASPECT_CLASS[slot]}`}>
      <CropImage src={images.slotSrc(slot)!} r={r} onLoad={onLoad} />
    </div>
  );
}

function CropBox({ images, slot }: { images: JamImages; slot: JamImageSlot }) {
  const { aspect } = JAM_IMAGE_SLOTS[slot];
  const { dims, r, onLoad } = useCrop(slot, images.rects[slot], images.slotFocal(slot));
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  // Several pointermoves can land before React re-renders, so each move builds
  // on the last one's result rather than on the rect from the last render.
  const latest = useRef(r);
  latest.current = r;

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent) {
    const frame = frameRef.current;
    const from = latest.current;
    if (!drag.current || !from || !frame) return;
    // Dragging the picture right shows more of its left, so the crop moves the
    // opposite way, scaled from frame pixels to fractions of the image.
    const dx = (-(e.clientX - drag.current.x) / frame.clientWidth) * from.w;
    const dy = (-(e.clientY - drag.current.y) / frame.clientHeight) * from.h;
    drag.current = { x: e.clientX, y: e.clientY };
    latest.current = panCrop(from, dx, dy);
    images.setRect(slot, latest.current);
  }

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        className={`relative w-full cursor-grab touch-none overflow-hidden rounded-2xl bg-zinc-100 active:cursor-grabbing ${ASPECT_CLASS[slot]}`}
      >
        <CropImage src={images.slotSrc(slot)!} r={r} onLoad={onLoad} />
      </div>
      <label className="flex items-center gap-3 text-xs text-zinc-500">
        Zoom
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          disabled={!r || !dims}
          value={r && dims ? cropZoom(r, dims.w, dims.h, aspect) : 1}
          onChange={(e) => r && dims && images.setRect(slot, zoomCrop(r, dims.w, dims.h, aspect, Number(e.target.value)))}
          className="flex-1 accent-zinc-900"
        />
      </label>
    </div>
  );
}

/**
 * The event image, with a crop for each place it is shown. Every crop starts
 * from the main image; a host can reposition and zoom each one, or give a
 * layout an image of its own.
 */
export default function EventImageEditor({ images }: { images: JamImages }) {
  const [slot, setSlot] = useState<JamImageSlot>("desktop");
  const [error, setError] = useState<string | null>(null);
  const mainInput = useRef<HTMLInputElement>(null);
  const slotInput = useRef<HTMLInputElement>(null);

  function picked(e: React.ChangeEvent<HTMLInputElement>, use: (file: File) => void) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isJamImageType(file.type, file.name)) {
      setError(JAM_IMAGE_TYPE_ERROR);
      return;
    }
    setError(null);
    use(file);
  }

  const inputs = (
    <>
      <input ref={mainInput} type="file" accept={JAM_IMAGE_TYPES.join(",")} className="hidden" onChange={(e) => picked(e, images.chooseMain)} />
      <input ref={slotInput} type="file" accept={JAM_IMAGE_TYPES.join(",")} className="hidden" onChange={(e) => picked(e, (f) => images.chooseSlotImage(slot, f))} />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </>
  );

  if (!images.main) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => mainInput.current?.click()}
          className="flex aspect-[3/2] w-full items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 text-sm text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-500 md:aspect-square"
        >
          Add an event image
        </button>
        {inputs}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3" role="tablist" aria-label="Image layout">
        {JAM_IMAGE_SLOT_KEYS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={slot === s}
            onClick={() => setSlot(s)}
            className={`space-y-1 rounded-lg p-1 text-xs font-medium transition-colors ${slot === s ? "bg-zinc-100 text-zinc-900 ring-2 ring-amber-400" : "text-zinc-500 hover:bg-zinc-50"}`}
          >
            <CropThumb key={images.slotSrc(s)} images={images} slot={s} />
            <span className="block">{JAM_IMAGE_SLOTS[s].label}</span>
          </button>
        ))}
      </div>

      <CropBox key={`${slot}:${images.slotSrc(slot)}`} images={images} slot={slot} />

      <div className="space-y-1 text-xs">
        <p className="text-zinc-500">{WHERE[slot]} Drag to reposition.</p>
        {images.hasOwnImage(slot) ? (
          <p className="text-zinc-500">
            Using its own image.{" "}
            <button type="button" onClick={() => images.revertToMain(slot)} className="font-medium text-zinc-700 hover:underline">
              Use the main image
            </button>
          </p>
        ) : (
          <button type="button" onClick={() => slotInput.current?.click()} className="font-medium text-zinc-700 hover:underline">
            Use a different image for {JAM_IMAGE_SLOTS[slot].label.toLowerCase()}
          </button>
        )}
      </div>

      <div className="flex gap-4 border-t border-zinc-100 pt-3">
        <button type="button" onClick={() => mainInput.current?.click()} className="text-xs text-zinc-500 transition-colors hover:text-zinc-700">
          Replace image
        </button>
        <button type="button" onClick={images.removeMain} className="text-xs text-zinc-400 transition-colors hover:text-zinc-600">
          Remove image
        </button>
      </div>
      {inputs}
    </div>
  );
}
