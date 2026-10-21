/**
 * Profile photo validation. The declared MIME type from the browser is not
 * trusted: the file's leading bytes must match the format. The database
 * enforces the same size and type limits as a second layer.
 */

// 4 MB keeps uploads under the hosting platform's request-body limit.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedPhotoType = (typeof ACCEPTED_PHOTO_TYPES)[number];

export function sniffImageType(bytes: Uint8Array): AcceptedPhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

export type PhotoValidation =
  | { ok: true; contentType: AcceptedPhotoType }
  | { ok: false; error: "empty" | "too_large" | "unsupported_type" | "mismatched_type" };

export function validatePhoto(bytes: Uint8Array, declaredType: string | null | undefined): PhotoValidation {
  if (bytes.length === 0) return { ok: false, error: "empty" };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: "too_large" };
  const sniffed = sniffImageType(bytes);
  if (!sniffed) return { ok: false, error: "unsupported_type" };
  if (declaredType && declaredType !== sniffed) return { ok: false, error: "mismatched_type" };
  return { ok: true, contentType: sniffed };
}

export const PHOTO_ERROR_MESSAGES: Record<Exclude<PhotoValidation, { ok: true }>["error"], string> = {
  empty: "Choose a photo to upload.",
  too_large: "That photo is larger than 4 MB. Choose a smaller image.",
  unsupported_type: "Use a JPEG, PNG or WebP image.",
  mismatched_type: "That file isn't a valid JPEG, PNG or WebP image.",
};
