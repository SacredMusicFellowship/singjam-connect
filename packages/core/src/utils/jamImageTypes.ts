// Cover images are also drawn into the link-preview card, whose renderer
// (Satori) only reads PNG and JPEG — a WebP cover shared as a blank white card.
export const JAM_IMAGE_TYPES = ["image/png", "image/jpeg"] as const;

export const JAM_IMAGE_TYPE_ERROR = "Please choose a JPEG or PNG image.";

// The native picker doesn't always report a type, so a file name (or URI) can
// stand in for it.
export function isJamImageType(mimeType: string | null | undefined, fileName?: string | null): boolean {
  if (mimeType) return (JAM_IMAGE_TYPES as readonly string[]).includes(mimeType.toLowerCase());
  return /\.(jpe?g|png)$/i.test(fileName ?? "");
}
