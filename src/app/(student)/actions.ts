"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCodeFrom, friendlyError } from "@/lib/errors";
import { requireStudent } from "@/lib/data/session";
import { REPORT_CATEGORIES } from "@/lib/profile/options";

/**
 * Student mutations. Each one validates input, then calls a database RPC
 * that re-derives the acting user from the session (auth.uid()) and enforces
 * every rule transactionally. Nothing here trusts client-supplied identity.
 */

type Result<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: string; code: string | null };

const uuid = z.uuid();

async function call<T>(fn: string, args: Record<string, unknown>, revalidate: string[] = []): Promise<Result<T>> {
  const viewer = await requireStudent();
  try {
    const data = await viewer.db.rpc<T>(fn, args);
    for (const path of revalidate) revalidatePath(path);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: friendlyError(error), code: errorCodeFrom(error) };
  }
}

function invalid(): { ok: false; error: string; code: null } {
  return { ok: false, error: "That request wasn't valid.", code: null };
}

export type DecisionResult = { status: "liked" | "passed" | "duplicate"; matched?: boolean; match_id?: string | null };

export async function decide(targetId: string, decision: "like" | "pass") {
  if (!uuid.safeParse(targetId).success || (decision !== "like" && decision !== "pass")) return invalid();
  return call<DecisionResult>("record_decision", { p_target: targetId, p_decision: decision }, ["/shortlist", "/matches"]);
}

export async function withdrawLike(targetId: string) {
  if (!uuid.safeParse(targetId).success) return invalid();
  return call("withdraw_like", { p_target: targetId }, ["/shortlist"]);
}

export async function reconsiderPass(targetId: string) {
  if (!uuid.safeParse(targetId).success) return invalid();
  return call("reconsider_pass", { p_target: targetId }, ["/shortlist", "/discover"]);
}

export async function saveShortlistOrder(candidateIds: string[]) {
  const parsed = z.array(uuid).max(500).safeParse(candidateIds);
  if (!parsed.success) return invalid();
  return call("set_shortlist_order", { p_candidates: parsed.data }, ["/shortlist"]);
}

export async function confirmPartnership(matchId: string) {
  if (!uuid.safeParse(matchId).success) return invalid();
  return call<{ status: "awaiting_partner" | "finalised"; match_id: string }>("confirm_partnership", { p_match: matchId }, [
    "/matches",
    "/partnership",
  ]);
}

export async function withdrawConfirmation(matchId: string) {
  if (!uuid.safeParse(matchId).success) return invalid();
  return call("withdraw_confirmation", { p_match: matchId }, ["/matches"]);
}

export async function declineMatch(matchId: string) {
  if (!uuid.safeParse(matchId).success) return invalid();
  return call("decline_match", { p_match: matchId }, ["/matches", "/shortlist"]);
}

export async function requestCancellation(matchId: string, reason: string) {
  const r = z.string().trim().min(10, "Please explain briefly (at least 10 characters).").max(1000).safeParse(reason);
  if (!uuid.safeParse(matchId).success) return invalid();
  if (!r.success) return { ok: false as const, error: r.error.issues[0]!.message, code: "REASON_REQUIRED" };
  return call("request_partnership_cancellation", { p_match: matchId, p_reason: r.data }, ["/partnership"]);
}

const reportSchema = z.object({
  reportedId: uuid,
  category: z.enum(REPORT_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
  explanation: z.string().trim().max(1000).optional().default(""),
});

export async function submitReport(input: unknown) {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Choose a reason for the report.", code: "INVALID_CATEGORY" };
  return call<{ status: "submitted" | "already_reported" }>("submit_report", {
    p_reported: parsed.data.reportedId,
    p_category: parsed.data.category,
    p_explanation: parsed.data.explanation || null,
  });
}

export async function requestAccountDeletion(reason: string) {
  const r = z.string().trim().max(500).safeParse(reason ?? "");
  if (!r.success) return invalid();
  return call("request_account_deletion", { p_reason: r.data || null }, ["/settings", "/me"]);
}
