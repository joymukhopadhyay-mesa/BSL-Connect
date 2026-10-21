import { NextResponse } from "next/server";
import { getViewer } from "@/lib/data/session";

/**
 * Serves a profile photo. The row is read under the viewer's RLS context, so
 * a photo is returned only when the viewer may see that profile (the same
 * rule as profile visibility). Responses are private to the browser.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });

  const viewer = await getViewer();
  if (!viewer) return new NextResponse(null, { status: 401 });

  const row = await viewer.db.maybeOne<{ content_type: string; data_b64: string }>(
    "select content_type, encode(data, 'base64') as data_b64 from public.profile_photos where user_id = $1",
    [id],
  );
  if (!row) return new NextResponse(null, { status: 404 });

  const body = Buffer.from(row.data_b64.replace(/\s+/g, ""), "base64");
  return new NextResponse(body, {
    headers: {
      "content-type": row.content_type,
      "content-length": String(body.byteLength),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}
