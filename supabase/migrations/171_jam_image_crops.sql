-- Migration 171: per-layout event images.
-- Each layout gets its own pre-cropped file: desktop (square, event page from
-- md up), mobile (3:2, event page on phones, native, link previews) and list
-- (square thumbnail on the jams list). Null falls back to image_url cropped
-- around image_focal_point, which is how every event made before this renders.
-- image_crops holds the editor's state so a host can reopen and adjust:
-- { "desktop": { "src": <url or null for image_url>, "x", "y", "w", "h" }, ... }
-- with x/y/w/h as fractions of the source image.

alter table public.jams
  add column if not exists image_desktop_url text,
  add column if not exists image_mobile_url text,
  add column if not exists image_list_url text,
  add column if not exists image_crops jsonb;
