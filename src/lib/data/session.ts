import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { readSessionToken } from "@/lib/auth/cookies";
import { isAllowedStudentEmail } from "@/lib/auth/domain";
import { sessionUser } from "@/lib/auth/otp";
import type { UserDb } from "@/lib/db/executor";
import { userDb } from "@/lib/db/neon";
import { isDatabaseConfigured } from "@/lib/env";

/**
 * Data Access Layer for the current user. Every protected page, server
 * action and route handler goes through these helpers; the proxy's redirect
 * is only an optimisation. The session token is validated against the
 * database on every request.
 */

export type MyStatus = {
  authenticated: boolean;
  /** Participation role: "admin" means a staff administrator with no student profile. */
  role: "student" | "admin" | null;
  /** Administrator access (staff admins, and students who also administer). */
  is_admin: boolean;
  profile_status: "draft" | "published" | null;
  onboarding_step: number | null;
  missing_fields: string[];
  suspended: boolean;
  partnership_match_id: string | null;
  deletion_requested: boolean;
};

export type Viewer = {
  id: string;
  email: string;
  status: MyStatus;
  /** RLS-scoped database handle for this user. */
  db: UserDb;
};

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = await readSessionToken(); // also marks the route as dynamic
  if (!token || !isDatabaseConfigured()) return null;

  const session = await sessionUser(token);
  if (!session) return null;

  const db = userDb(session.user_id);
  const status = await db.rpc<MyStatus>("my_status");
  if (!status?.role) return null;
  // A student account must match the student domain.
  // (Allowlisted team addresses that also participate are student + admin and are exempt.)
  if (status.role === "student" && !status.is_admin && !isAllowedStudentEmail(session.email)) return null;

  return { id: session.user_id, email: session.email, status, db };
});

export async function requireViewer(next?: string): Promise<Viewer> {
  if (!isDatabaseConfigured()) redirect("/setup");
  const viewer = await getViewer();
  if (!viewer) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  return viewer;
}

/** Any student, including drafts (onboarding, settings, own profile). */
export async function requireStudent(next?: string): Promise<Viewer> {
  const viewer = await requireViewer(next);
  if (viewer.status.role === "admin") redirect("/admin");
  return viewer;
}

/** A student whose profile is published and not suspended (discovery, matching). */
export async function requireActiveStudent(next?: string): Promise<Viewer> {
  const viewer = await requireStudent(next);
  if (viewer.status.suspended) redirect("/settings?notice=suspended");
  if (viewer.status.profile_status !== "published") redirect("/onboarding");
  return viewer;
}

/** Administrators only (including students who also administer). Others get a 404. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer("/admin");
  if (!viewer.status.is_admin) notFound();
  return viewer;
}

/** Where a signed-in user should land. */
export function homeFor(status: MyStatus): string {
  if (status.role === "admin") return "/admin";
  if (status.profile_status !== "published") return "/onboarding";
  if (status.partnership_match_id) return "/partnership";
  return "/discover";
}
