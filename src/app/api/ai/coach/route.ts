import { NextResponse } from "next/server";
import { getAI } from "@/lib/ai/config";
import { coachRequestSchema, runProfileCoach } from "@/lib/ai/coach";
import { AIGroundingError, AIRateLimitedError, AIUnavailableError, isAIError } from "@/lib/ai/errors";
import { getViewer } from "@/lib/data/session";

/**
 * AI profile coach. Returns a suggestion only — nothing is saved. The
 * student must review and explicitly accept it in the UI, which then saves
 * through the normal profile action.
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = coachRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  let allowed: boolean;
  try {
    allowed = await viewer.db.rpc<boolean>("consume_ai_quota", { p_feature: "profile_coach" });
  } catch {
    return NextResponse.json({ error: "Please try again." }, { status: 500 });
  }
  if (!allowed) {
    const e = new AIRateLimitedError();
    return NextResponse.json({ error: e.message, code: e.code }, { status: 429 });
  }

  try {
    const result = await runProfileCoach(provider, parsed.data);
    return NextResponse.json({ result, model: provider.model });
  } catch (error) {
    if (isAIError(error)) {
      const status = error instanceof AIUnavailableError ? 503 : error instanceof AIGroundingError ? 422 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("[ai/coach] unexpected", error instanceof Error ? error.name : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
