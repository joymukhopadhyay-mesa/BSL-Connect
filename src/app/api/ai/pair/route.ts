import { NextResponse } from "next/server";
import { z } from "zod";
import { getAI } from "@/lib/ai/config";
import { AIRateLimitedError, AIUnavailableError, isAIError } from "@/lib/ai/errors";
import { pairInputVersion, pairResultSchema, runPairInsight } from "@/lib/ai/pair";
import { getProfile } from "@/lib/data/profiles";
import { getViewer } from "@/lib/data/session";
import { pairInsights } from "@/lib/matching/insights";
import { scoreCompatibility } from "@/lib/matching/scoring";

const bodySchema = z.object({ candidateId: z.uuid() });

/**
 * AI explanation for a pairing. The candidate profile is fetched with the
 * viewer's own session, so RLS decides whether the viewer may see it at all.
 * Results are cached per (viewer, candidate, both profile versions).
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (viewer.status.role !== "student") return NextResponse.json({ error: "Not available." }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || parsed.data.candidateId === viewer.id) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const [me, them] = await Promise.all([
    getProfile(viewer.db, viewer.id),
    getProfile(viewer.db, parsed.data.candidateId),
  ]);
  if (!me || !them) return NextResponse.json({ error: "This profile is no longer available." }, { status: 404 });

  const version = pairInputVersion(me, them);
  const cached = await viewer.db.maybeOne<{ result: unknown; model: string | null }>(
    `select result, model from public.ai_insights
     where feature = 'pair_insight' and viewer_id = $1 and subject_id = $2 and input_version = $3 and expires_at > now()`,
    [viewer.id, them.id, version],
  );
  if (cached) {
    const valid = pairResultSchema.safeParse(cached.result);
    if (valid.success) return NextResponse.json({ result: valid.data, model: cached.model, cached: true });
  }

  const { provider } = getAI();
  if (!provider) {
    const e = new AIUnavailableError();
    return NextResponse.json({ error: e.message, code: e.code }, { status: 503 });
  }

  const allowed = await viewer.db.rpc<boolean>("consume_ai_quota", { p_feature: "pair_insight" }).catch(() => false);
  if (!allowed) {
    const e = new AIRateLimitedError();
    return NextResponse.json({ error: e.message, code: e.code }, { status: 429 });
  }

  try {
    const compatibility = scoreCompatibility(me, them);
    const insights = pairInsights(me, them);
    const result = await runPairInsight(provider, me, them, compatibility, insights);
    // Idempotent upsert keyed by versions — a retried request can't duplicate rows.
    await viewer.db.rpc("store_ai_insight", {
      p_subject: them.id,
      p_input_version: version,
      p_model: provider.model,
      p_result: JSON.stringify(result),
    });
    return NextResponse.json({ result, model: provider.model, cached: false });
  } catch (error) {
    if (isAIError(error)) {
      const status = error instanceof AIUnavailableError ? 503 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("[ai/pair] unexpected", error instanceof Error ? error.name : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
