import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { getViewer } from "@/lib/data/session";
import { EXPORT_COLUMNS } from "@/lib/export";
import { careerObjectiveLabels } from "@/lib/profile/options";

/**
 * Cohort CSV for administrators. Only permitted fields (see
 * admin_export_rows): no likes, passes, reports, moderation notes, tokens or
 * auth metadata. The export itself is recorded in the audit log.
 */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (viewer.status.role !== "admin") return NextResponse.json({ error: "Not found." }, { status: 404 });

  let data: Array<Record<string, unknown>>;
  try {
    data = await viewer.db.rpcRows("admin_export_rows");
  } catch {
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }

  const rows: Array<Record<string, unknown>> = data.map((r) => ({
    ...r,
    career_objectives: careerObjectiveLabels(String(r.career_objectives ?? "").split("; ").filter(Boolean)).join("; "),
  }));
  const csv = toCsv(rows, EXPORT_COLUMNS.map((c) => ({ key: c.key as string, header: c.header })));
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bsl-connect-cohort-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
