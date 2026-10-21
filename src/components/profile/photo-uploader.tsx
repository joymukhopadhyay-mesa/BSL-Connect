"use client";

import { Camera, RefreshCw, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { Notice, ProfilePhoto } from "@/components/ui/misc";
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES, PHOTO_ERROR_MESSAGES } from "@/lib/photo";

const OUT_W = 960;
const OUT_H = 1200; // 4:5 portrait, matches the discovery card

type Loaded = { img: HTMLImageElement; url: string };

/**
 * Single profile photo: choose → crop (pan + zoom) → confirm → upload.
 * Uploading again replaces the same photo; there is no gallery.
 */
export function PhotoUploader({
  currentUrl,
  name,
  onUploaded,
}: {
  currentUrl: string | null;
  name: string | null;
  onUploaded: (result: { photo_url: string | null; photo_path: string; photo_updated_at: string | null }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!loaded || !el) return;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  useEffect(() => () => {
    if (loaded) URL.revokeObjectURL(loaded.url);
  }, [loaded]);

  function choose(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setError(PHOTO_ERROR_MESSAGES.unsupported_type);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES * 4) {
      // Large originals are fine to crop (we re-encode), but not absurd ones.
      setError("That image is very large. Choose one under 20 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setLoaded({ img, url });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError(PHOTO_ERROR_MESSAGES.mismatched_type);
    };
    img.src = url;
  }

  /** Geometry of the image inside the 4:5 frame ("cover" scaled, then zoomed/panned). */
  function layout(frameW: number, frameH: number) {
    const { img } = loaded!;
    const cover = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight) * zoom;
    const w = img.naturalWidth * cover;
    const h = img.naturalHeight * cover;
    const maxX = (w - frameW) / 2;
    const maxY = (h - frameH) / 2;
    const x = Math.max(-maxX, Math.min(maxX, offset.x));
    const y = Math.max(-maxY, Math.min(maxY, offset.y));
    return { w, h, x, y, scale: cover };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setOffset({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function exportCrop(): Promise<Blob> {
    const el = frameRef.current!;
    const fw = el.clientWidth;
    const fh = el.clientHeight;
    const g = layout(fw, fh);
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d")!;
    const k = OUT_W / fw;
    const left = (fw - g.w) / 2 + g.x;
    const top = (fh - g.h) / 2 + g.y;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(loaded!.img, left * k, top * k, g.w * k, g.h * k);
    const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.88));
    if (webp && webp.type === "image/webp") return webp;
    const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!jpeg) throw new Error("encode");
    return jpeg;
  }

  async function upload() {
    if (!loaded || !confirmed) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await exportCrop();
      const form = new FormData();
      form.set("photo", new File([blob], blob.type === "image/webp" ? "avatar.webp" : "avatar.jpg", { type: blob.type }));
      form.set("confirm", "true");
      const res = await fetch("/api/profile/photo", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Upload failed. Please try again.");
        return;
      }
      onUploaded(json);
      setLoaded(null);
      setConfirmed(false);
    } catch {
      setError("We couldn't process that image. Try a different photo.");
    } finally {
      setUploading(false);
    }
  }

  const frameStyle = loaded && frame ? layout(frame.w, frame.h) : null;

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_PHOTO_TYPES.join(",")}
        className="sr-only"
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
        aria-label="Choose a profile photo"
      />

      {!loaded ? (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-end">
          <ProfilePhoto src={currentUrl} name={name} className="aspect-[4/5] w-44 text-3xl shadow-soft" rounded="rounded-[1.5rem]" priority />
          <div className="flex flex-col items-center gap-3 sm:items-start">
            <Button type="button" variant={currentUrl ? "secondary" : "primary"} onClick={() => inputRef.current?.click()} icon={currentUrl ? <RefreshCw className="size-4" /> : <Camera className="size-4" />}>
              {currentUrl ? "Replace photo" : "Choose a photo"}
            </Button>
            <p className="max-w-xs text-center text-sm text-ink-muted sm:text-left">
              JPEG, PNG or WebP. A clear, recent photo of your face, on your own. You&apos;ll crop it next.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div
            ref={frameRef}
            className="relative aspect-[4/5] w-full max-w-[17rem] touch-none overflow-hidden rounded-[1.5rem] bg-forest-900 shadow-lift select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="img"
            aria-label="Crop preview. Drag to reposition."
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={loaded.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
              style={
                frameStyle
                  ? { width: frameStyle.w, height: frameStyle.h, transform: `translate(calc(-50% + ${frameStyle.x}px), calc(-50% + ${frameStyle.y}px))` }
                  : { width: "100%", height: "100%", objectFit: "cover", transform: "translate(-50%, -50%)" }
              }
            />
            <div className="pointer-events-none absolute inset-0 rounded-[1.5rem] ring-1 ring-white/30 ring-inset" />
          </div>
          <label className="flex w-full max-w-[17rem] items-center gap-3 text-sm text-ink-muted">
            <ZoomIn className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-forest-800"
            />
          </label>
          <p className="text-xs text-ink-subtle">Drag to reposition · use the slider to zoom</p>
          <div className="w-full max-w-md">
            <Checkbox
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              label="This photo clearly shows me, and only me."
              description="This is your own declaration — BSL Connect doesn't verify identity from photos. Classmates can report a photo that doesn't appear genuine, and the programme team may remove it."
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setLoaded(null)} disabled={uploading}>
              Cancel
            </Button>
            <Button type="button" onClick={upload} loading={uploading} disabled={!confirmed}>
              {currentUrl ? "Replace my photo" : "Save photo"}
            </Button>
          </div>
        </div>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
