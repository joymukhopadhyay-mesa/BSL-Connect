/**
 * Voice-dictation upload validation, shaped like `photo.ts`: the browser's
 * declared MIME type is not trusted, the leading bytes must match a known
 * audio container. Audio is processed in memory only and never stored.
 *
 * The browser converts every recording to 16 kHz mono 16-bit WAV before
 * upload (OpenRouter's audio input does not list webm or mp4), so only WAV
 * and Ogg are accepted. WebM and MP4 are still recognised so they get a
 * precise "not supported" answer instead of a generic one.
 */

/** Hard cap on one recording; the client stops automatically at this length. */
export const MAX_RECORDING_SECONDS = 90;
/** Target sample rate of the uploaded WAV. */
export const UPLOAD_SAMPLE_RATE = 16_000;
/** 90 s of 16 kHz mono 16-bit PCM is about 2.9 MB; leave headroom, stay under the host's 4.5 MB body limit. */
export const MAX_AUDIO_BYTES = Math.round(3.2 * 1024 * 1024);

export type AudioFormat = "wav" | "ogg" | "webm" | "mp4";
export const UPLOAD_AUDIO_FORMATS = ["wav", "ogg"] as const satisfies readonly AudioFormat[];

export function sniffAudioFormat(bytes: Uint8Array): AudioFormat | null {
  // RIFF....WAVE
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
  ) return "wav";
  // OggS
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return "ogg";
  // EBML header (WebM / Matroska)
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  // ISO base media: 4-byte box size, then "ftyp"
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "mp4";
  return null;
}

const DECLARED_TYPES: Record<AudioFormat, string[]> = {
  wav: ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"],
  ogg: ["audio/ogg", "application/ogg"],
  webm: ["audio/webm", "video/webm"],
  mp4: ["audio/mp4", "video/mp4", "audio/x-m4a", "audio/m4a"],
};

export type AudioValidation =
  | { ok: true; format: AudioFormat }
  | { ok: false; error: "empty" | "too_large" | "unsupported_type" | "mismatched_type" };

export function validateAudio(
  bytes: Uint8Array,
  declaredType: string | null | undefined,
  allowed: readonly AudioFormat[] = UPLOAD_AUDIO_FORMATS,
): AudioValidation {
  if (bytes.length === 0) return { ok: false, error: "empty" };
  if (bytes.length > MAX_AUDIO_BYTES) return { ok: false, error: "too_large" };
  const sniffed = sniffAudioFormat(bytes);
  if (!sniffed || !allowed.includes(sniffed)) return { ok: false, error: "unsupported_type" };
  const declared = declaredType?.split(";")[0]?.trim().toLowerCase();
  if (declared && !DECLARED_TYPES[sniffed].includes(declared)) return { ok: false, error: "mismatched_type" };
  return { ok: true, format: sniffed };
}

export const AUDIO_ERROR_MESSAGES: Record<Exclude<AudioValidation, { ok: true }>["error"], string> = {
  empty: "That recording was empty. Please try again.",
  too_large: "That recording is too long. Please keep it under 90 seconds.",
  unsupported_type: "Your browser's recording format isn't supported. Please type your answer instead.",
  mismatched_type: "That file isn't a valid audio recording.",
};
