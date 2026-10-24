/**
 * Browser-side helpers for voice dictation: feature detection, recorder mime
 * choice, conversion of a recording to 16 kHz mono WAV, and appending the
 * transcript to a field. The pure functions are unit-tested; the rest needs
 * a real browser and is covered by the Playwright test.
 */
import { UPLOAD_SAMPLE_RATE } from "./audio";

type Win = typeof globalThis & {
  MediaRecorder?: typeof MediaRecorder;
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  OfflineAudioContext?: typeof OfflineAudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};

/** True when this browser can record from the microphone and convert the result. */
export function voiceInputSupported(g: Win = globalThis as Win): boolean {
  const nav = g.navigator as Navigator | undefined;
  return Boolean(
    nav?.mediaDevices?.getUserMedia &&
      g.MediaRecorder &&
      (g.AudioContext ?? g.webkitAudioContext) &&
      (g.OfflineAudioContext ?? g.webkitOfflineAudioContext),
  );
}

/** webm/opus on Chrome and Android, mp4 on Safari and iOS; otherwise the browser default. */
export function pickRecorderMimeType(recorder: Pick<typeof MediaRecorder, "isTypeSupported"> | undefined): string | undefined {
  if (!recorder?.isTypeSupported) return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => recorder.isTypeSupported(t));
}

/** 16-bit PCM mono WAV (RIFF) from float samples in [-1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate = UPLOAD_SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

export function peakLevel(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]!);
    if (v > peak) peak = v;
  }
  return peak;
}

export type PreparedAudio = { wav: Uint8Array; seconds: number; peak: number };

/** Decode a MediaRecorder blob (webm, mp4, ogg…) and resample it to 16 kHz mono WAV. */
export async function recordingToWav(blob: Blob): Promise<PreparedAudio> {
  const g = globalThis as Win;
  const Ctx = g.AudioContext ?? g.webkitAudioContext!;
  const Offline = g.OfflineAudioContext ?? g.webkitOfflineAudioContext!;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * UPLOAD_SAMPLE_RATE));
    const offline = new Offline(1, length, UPLOAD_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    return { wav: encodeWav(samples), seconds: decoded.duration, peak: peakLevel(samples) };
  } finally {
    void ctx.close().catch(() => {});
  }
}

export type AppendResult = { text: string; added: boolean; truncated: boolean };

/**
 * Append a transcript to existing text with one space between them. Never
 * overwrites, never exceeds `max` (cutting the transcript at a word boundary).
 */
export function appendTranscript(existing: string, addition: string, max: number): AppendResult {
  const add = addition.trim();
  if (!add) return { text: existing, added: false, truncated: false };
  const base = existing.replace(/\s+$/, "");
  const sep = base ? " " : "";
  if (base.length + sep.length + add.length <= max) return { text: base + sep + add, added: true, truncated: false };
  const room = max - base.length - sep.length;
  if (room < 4) return { text: existing, added: false, truncated: true };
  let cut = add.slice(0, room);
  const space = cut.lastIndexOf(" ");
  if (space > room * 0.5 && add[room] !== " ") cut = cut.slice(0, space);
  cut = cut.replace(/[\s,;:]+$/, "");
  if (!cut) return { text: existing, added: false, truncated: true };
  return { text: base + sep + cut, added: true, truncated: true };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Plain-language message for a failed getUserMedia call. */
export function microphoneErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. Allow it in your browser's site settings, then try again, or just type your answer.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found on this device. You can type your answer instead.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Your microphone is in use by another app. Close it and try again.";
  }
  return "Couldn't start the microphone. You can type your answer instead.";
}
