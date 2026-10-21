import { NextResponse } from "next/server";
import { getViewer } from "@/lib/data/session";
import { photoUrl } from "@/lib/data/profiles";
import { friendlyError } from "@/lib/errors";
import { MAX_PHOTO_BYTES, PHOTO_ERROR_MESSAGES, validatePhoto } from "@/lib/photo";

/**
 * Upload or replace the student's single profile photo.
 *
 * - The file is validated by its bytes, not the declared type.
 * - It is stored in public.profile_photos, whose primary key is the user id,
 *   so an upload always replaces the one photo slot.
 * - The student's explicit confirmation that the photo depicts them is required.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (viewer.status.role !== "student") return NextResponse.json({ error: "Only students have profile photos." }, { status: 403 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PHOTO_BYTES + 64 * 1024) {
    return NextResponse.json({ error: PHOTO_ERROR_MESSAGES.too_large }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: PHOTO_ERROR_MESSAGES.empty }, { status: 400 });
  }
  if (form.get("confirm") !== "true") {
    return NextResponse.json({ error: "Confirm that the photo depicts you." }, { status: 400 });
  }
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: PHOTO_ERROR_MESSAGES.empty }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validatePhoto(bytes, file.type || null);
  if (!check.ok) {
    return NextResponse.json({ error: PHOTO_ERROR_MESSAGES[check.error] }, { status: check.error === "too_large" ? 413 : 400 });
  }

  try {
    const res = await viewer.db.rpc<{ photo_path: string; photo_updated_at: string }>("upload_profile_photo", {
      p_data_base64: Buffer.from(bytes).toString("base64"),
      p_content_type: check.contentType,
      p_confirmed: true,
    });
    return NextResponse.json({
      photo_path: res.photo_path,
      photo_updated_at: res.photo_updated_at,
      photo_url: photoUrl({ id: viewer.id, photo_path: res.photo_path, photo_updated_at: res.photo_updated_at }),
    });
  } catch (error) {
    console.error("[photo] upload failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: friendlyError(error) }, { status: 400 });
  }
}
