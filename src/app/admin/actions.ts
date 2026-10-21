"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyError } from "@/lib/errors";
import { requireAdmin } from "@/lib/data/session";

/**
 * Administrator mutations. requireAdmin() gates the UI path, and every RPC
 * re-checks admin status in the database (private.require_admin), so a
 * forged request from a student session fails there too.
 */

type Result = { ok: true } | { ok: false; error: string };
const uuid = z.uuid();
const note = z.string().trim().min(3, "Add a short note for the audit trail.").max(1000);

async function rpc(fn: string, args: Record<string, unknown>, paths: string[]): Promise<Result> {
  const admin = await requireAdmin();
  try {
    await admin.db.rpc(fn, args);
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
  paths.forEach((p) => revalidatePath(p));
  return { ok: true };
}

export async function setSuspension(userId: string, suspended: boolean, reason: string): Promise<Result> {
  if (!uuid.safeParse(userId).success) return { ok: false, error: "Invalid student." };
  const r = suspended ? note.safeParse(reason) : z.string().max(1000).safeParse(reason ?? "");
  if (!r.success) return { ok: false, error: r.error.issues[0]!.message };
  return rpc("admin_set_suspension", { p_user: userId, p_suspended: suspended, p_reason: r.data || null }, [`/admin/students/${userId}`, "/admin/students", "/admin"]);
}

export async function removePhoto(userId: string, reason: string): Promise<Result> {
  if (!uuid.safeParse(userId).success) return { ok: false, error: "Invalid student." };
  const r = note.safeParse(reason);
  if (!r.success) return { ok: false, error: r.error.issues[0]!.message };
  return rpc("admin_remove_photo", { p_user: userId, p_reason: r.data }, [`/admin/students/${userId}`]);
}

export async function updateReport(reportId: string, status: string, reportNote: string): Promise<Result> {
  if (!uuid.safeParse(reportId).success) return { ok: false, error: "Invalid report." };
  const s = z.enum(["open", "in_review", "resolved", "dismissed"]).safeParse(status);
  if (!s.success) return { ok: false, error: "Invalid status." };
  const n = z.string().trim().max(1000).safeParse(reportNote ?? "");
  if (!n.success) return { ok: false, error: "Note is too long." };
  if ((s.data === "resolved" || s.data === "dismissed") && n.data.length < 3) {
    return { ok: false, error: "Add a short note explaining the outcome." };
  }
  return rpc("admin_update_report", { p_report: reportId, p_status: s.data, p_note: n.data || null }, ["/admin/reports", "/admin"]);
}

export async function cancelPartnership(matchId: string, reason: string): Promise<Result> {
  if (!uuid.safeParse(matchId).success) return { ok: false, error: "Invalid partnership." };
  const r = note.safeParse(reason);
  if (!r.success) return { ok: false, error: r.error.issues[0]!.message };
  return rpc("admin_cancel_partnership", { p_match: matchId, p_note: r.data }, ["/admin/partnerships", "/admin"]);
}

export async function dismissCancellation(matchId: string, reason: string): Promise<Result> {
  if (!uuid.safeParse(matchId).success) return { ok: false, error: "Invalid partnership." };
  const r = note.safeParse(reason);
  if (!r.success) return { ok: false, error: r.error.issues[0]!.message };
  return rpc("admin_dismiss_cancellation_request", { p_match: matchId, p_note: r.data }, ["/admin/partnerships", "/admin"]);
}

/**
 * Completes an account removal the student requested. Deleting the account
 * row cascades to every student-owned row; an audit entry is kept.
 */
export async function completeAccountDeletion(userId: string): Promise<Result> {
  if (!uuid.safeParse(userId).success) return { ok: false, error: "Invalid student." };
  return rpc("admin_delete_account", { p_user: userId }, ["/admin/students", "/admin"]);
}
