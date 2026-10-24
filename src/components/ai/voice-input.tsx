"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MAX_RECORDING_SECONDS } from "@/lib/audio";
import {
  appendTranscript,
  formatClock,
  microphoneErrorMessage,
  pickRecorderMimeType,
  recordingToWav,
  voiceInputSupported,
} from "@/lib/audio-client";

const NOTE_KEY = "bsl-voice-note-seen";
const MIN_SECONDS = 0.8;
const SILENT_PEAK = 0.01;
const WARN_AT_SECONDS = MAX_RECORDING_SECONDS - 10;

type State =
  | { kind: "idle" }
  | { kind: "consent" }
  | { kind: "starting" }
  | { kind: "recording" }
  | { kind: "transcribing" };

const noopSubscribe = () => () => {};

let noteSeenInMemory = false;
function noteSeen(): boolean {
  if (noteSeenInMemory) return true;
  try {
    return window.localStorage.getItem(NOTE_KEY) === "1";
  } catch {
    return false;
  }
}
function markNoteSeen() {
  noteSeenInMemory = true;
  try {
    window.localStorage.setItem(NOTE_KEY, "1");
  } catch {
    /* private mode: the note simply shows again next visit */
  }
}

/**
 * Microphone button for a free-text field. Tap, speak, tap again: the
 * recording is turned into text by the AI provider and appended to the
 * field, where the student can edit it. Renders nothing when the browser
 * can't record or AI is unavailable, so typing is never affected.
 *
 * Audio is recorded in memory, converted to 16 kHz mono WAV in the browser,
 * sent once to /api/ai/transcribe and discarded; nothing is stored.
 */
export function VoiceInput({
  label,
  value,
  max,
  onChange,
  aiAvailable,
}: {
  /** Visible label of the field, used in the button's accessible name. */
  label: string;
  value: string;
  max: number;
  onChange: (next: string) => void;
  aiAvailable: boolean;
}) {
  const supported = useSyncExternalStore(noopSubscribe, () => voiceInputSupported(), () => false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [announce, setAnnounce] = useState("");

  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const warnedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const releaseMicrophone = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(
    () => () => {
      discardRef.current = true;
      abortRef.current?.abort();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      releaseMicrophone();
    },
    [releaseMicrophone],
  );

  const transcribe = useCallback(async (blob: Blob) => {
    setState({ kind: "transcribing" });
    setAnnounce("Turning your recording into text.");
    const fail = (text: string) => {
      setState({ kind: "idle" });
      setMessage({ tone: "error", text });
      setAnnounce(text);
    };
    let wav: Uint8Array;
    try {
      const prepared = await recordingToWav(blob);
      if (prepared.seconds < MIN_SECONDS || prepared.peak < SILENT_PEAK) {
        return fail("We couldn't hear you. Check your microphone, speak a little louder or closer, and try again.");
      }
      wav = prepared.wav;
    } catch {
      return fail("We couldn't process that recording in your browser. You can type your answer instead.");
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const form = new FormData();
      form.append("audio", new Blob([wav as BlobPart], { type: "audio/wav" }), "recording.wav");
      const res = await fetch("/api/ai/transcribe", { method: "POST", body: form, signal: controller.signal });
      const json = (await res.json().catch(() => ({}))) as { text?: string; unclear?: boolean; error?: string };
      if (!res.ok || !json.text) {
        return fail(json.error ?? "Voice dictation isn't available right now. You can type your answer instead.");
      }
      const result = appendTranscript(valueRef.current, json.text, max);
      setState({ kind: "idle" });
      if (!result.added) {
        const text = "This answer is already at its length limit, so nothing was added. Shorten it first, then dictate again.";
        setMessage({ tone: "error", text });
        setAnnounce(text);
        return;
      }
      onChangeRef.current(result.text);
      const text = result.truncated
        ? "Added as much as fits. Please read it and edit anything that's wrong."
        : json.unclear
          ? "Added to your answer. Some words were unclear, so please read it and fix anything that's wrong."
          : "Added to your answer. Please read it and edit anything that's wrong.";
      setMessage({ tone: "info", text });
      setAnnounce(text);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      fail("Couldn't reach the AI service. Check your connection and try again.");
    } finally {
      abortRef.current = null;
    }
  }, [max]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    stop();
  }, [stop]);

  const begin = useCallback(async () => {
    setMessage(null);
    setState({ kind: "starting" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      const text = microphoneErrorMessage(error);
      setState({ kind: "idle" });
      setMessage({ tone: "error", text });
      setAnnounce(text);
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    discardRef.current = false;
    warnedRef.current = false;
    let recorder: MediaRecorder;
    try {
      const mimeType = pickRecorderMimeType(MediaRecorder);
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      releaseMicrophone();
      const text = "Couldn't start recording in this browser. You can type your answer instead.";
      setState({ kind: "idle" });
      setMessage({ tone: "error", text });
      setAnnounce(text);
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = () => {
      discardRef.current = true;
      releaseMicrophone();
      const text = "The recording stopped unexpectedly. Please try again.";
      setState({ kind: "idle" });
      setMessage({ tone: "error", text });
      setAnnounce(text);
    };
    recorder.onstop = () => {
      releaseMicrophone();
      recorderRef.current = null;
      if (discardRef.current) {
        setState({ kind: "idle" });
        setAnnounce("Recording cancelled.");
        return;
      }
      void transcribe(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
    };

    const startedAt = Date.now();
    setElapsed(0);
    recorder.start();
    setState({ kind: "recording" });
    setAnnounce("Recording. Tap the button again when you're done.");
    timerRef.current = setInterval(() => {
      const seconds = (Date.now() - startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= WARN_AT_SECONDS && !warnedRef.current) {
        warnedRef.current = true;
        setAnnounce("10 seconds left.");
      }
      if (seconds >= MAX_RECORDING_SECONDS) stop();
    }, 250);
  }, [releaseMicrophone, stop, transcribe]);

  // Keyboard users keep their place: if the focused control disappears (the
  // consent panel closing) or was disabled, put focus back on the mic button.
  const previousKind = useRef<State["kind"]>("idle");
  useEffect(() => {
    if (previousKind.current === state.kind) return;
    previousKind.current = state.kind;
    const active = document.activeElement;
    if (!active || active === document.body) buttonRef.current?.focus();
  }, [state.kind]);

  if (!supported || !aiAvailable) return null;

  const recording = state.kind === "recording";
  const busy = state.kind === "starting" || state.kind === "transcribing";

  function onPress() {
    // aria-disabled (not disabled) while busy, so the button never drops keyboard focus.
    if (busy || state.kind === "consent") return;
    if (recording) return stop();
    if (!noteSeen()) return setState({ kind: "consent" });
    void begin();
  }

  const accessibleName = recording
    ? `Stop recording and add the text to: ${label}`
    : state.kind === "transcribing"
      ? "Turning your recording into text"
      : `Dictate your answer by voice: ${label}`;

  // Renders as children of the parent's flex-wrap row, so the mic sits next to
  // the "Improve with AI" button; notes and messages wrap to their own line.
  return (
    <>
      <button
          type="button"
          onClick={onPress}
          ref={buttonRef}
          title={recording ? "Tap to finish" : "Speak your answer"}
          aria-disabled={busy || state.kind === "consent" || undefined}
          aria-label={accessibleName}
          aria-busy={busy || undefined}
          className={
            "relative inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-full border text-sm font-medium transition-colors " +
            (recording ? "w-auto px-4 " : "") +
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-600 aria-disabled:opacity-60 " +
            (recording
              ? "border-danger bg-danger-soft text-danger"
              : "border-forest-800/15 bg-sage-100/80 text-forest-800 hover:bg-sage-200")
          }
        >
          {recording ? (
            <span className="relative flex size-5 items-center justify-center" aria-hidden>
              <span className="absolute inline-flex size-5 rounded-full bg-danger/30 motion-safe:animate-ping" />
              <Square className="relative size-3.5 fill-current" />
            </span>
          ) : busy ? (
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
          ) : (
            <Mic className="size-5" aria-hidden />
          )}
          {recording ? (
            <span aria-hidden className="tabular-nums" data-testid="voice-timer">
              {formatClock(elapsed)} / {formatClock(MAX_RECORDING_SECONDS)}
            </span>
          ) : null}
        </button>
        {recording ? (
          <button
            type="button"
            onClick={cancel}
            className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Cancel
          </button>
        ) : null}

      {state.kind === "consent" ? (
        <div className="order-last basis-full rounded-2xl border border-sage-300 bg-sage-100/70 p-3" role="group" aria-label="About voice dictation">
          <p className="text-sm leading-relaxed text-ink">
            Your recording is sent to our AI provider to be turned into text, and it isn&apos;t stored. You can edit the text before you
            continue.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => {
                markNoteSeen();
                void begin();
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-forest-800 px-5 text-sm font-medium text-ivory-50 hover:bg-forest-700"
            >
              <Mic className="size-4" aria-hidden /> Start recording
            </button>
            <button
              type="button"
              onClick={() => setState({ kind: "idle" })}
              className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-ink-muted hover:text-ink"
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p
          className={"order-last basis-full text-sm " + (message.tone === "error" ? "text-danger" : "text-ink-muted")}
          role={message.tone === "error" ? "alert" : undefined}
        >
          {message.text}
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {message?.tone === "error" ? "" : announce}
      </p>
    </>
  );
}
