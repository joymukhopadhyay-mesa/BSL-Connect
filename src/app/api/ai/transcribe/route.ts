import { NextResponse } from "next/server";
import { getAI } from "@/lib/ai/config";
import { AIRateLimitedError, AIUnavailableError, isAIError } from "@/lib/ai/errors";
import { NoSpeechError, runTranscription } from "@/lib/ai/transcribe";
import { AUDIO_ERROR_MESSAGES, MAX_AUDIO_BYTES, validateAudio } from "@/lib/audio";
import { getViewer } from "@/lib/data/session";

export const maxDuration = 60;

/**
 * Voice dictation. Takes one short audio recording (multipart field
 * `audio`), returns a transcript for the student to review. The audio is
 * validated by its leading bytes, held in memory for this request only and
 * never written anywhere. Nothing is saved: the text goes into a form field.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (viewer.status.role !== "student") return NextResponse.json({ error: "Not available." }, { status: 403 });

  const { provider } = getAI();
  if (!provider) {
    const e = new AIUnavailableError();
    return NextResponse.json({ error: e.message, code: e.code }, { status: 503 });
  }

  const tooLarge = NextResponse.json({ error: AUDIO_ERROR_MESSAGES.too_large, code: "TOO_LARGE" }, { status: 413 });
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_AUDIO_BYTES + 64 * 1024) return tooLarge;

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("audio");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (file.size > MAX_AUDIO_BYTES) return tooLarge;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateAudio(bytes, file.type);
  if (!check.ok) {
    const status = check.error === "too_large" ? 413 : 400;
    return NextResponse.json({ error: AUDIO_ERROR_MESSAGES[check.error], code: check.error.toUpperCase() }, { status });
  }

  let allowed: boolean;
  try {
    allowed = await viewer.db.rpc<boolean>("consume_ai_quota", { p_feature: "voice_transcription" });
  } catch (error) {
    console.error("[ai/transcribe] quota check failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Please try again." }, { status: 500 });
  }
  if (!allowed) {
    const e = new AIRateLimitedError("You've reached the hourly limit for voice dictation. You can keep typing, or try again later.");
    return NextResponse.json({ error: e.message, code: e.code }, { status: 429 });
  }

  try {
    const result = await runTranscription(provider, { bytes, format: check.format as "wav" | "ogg" });
    return NextResponse.json({ text: result.text, unclear: result.unclear, truncated: result.truncated });
  } catch (error) {
    if (error instanceof NoSpeechError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    if (isAIError(error)) {
      const status = error instanceof AIUnavailableError ? 503 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("[ai/transcribe] unexpected", error instanceof Error ? error.name : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
