import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { USER_CONTEXT_SQL, claimsFor, UserDb, type Executor } from "./executor";

/**
 * Neon serverless driver over HTTP. A user-scoped statement is sent together
 * with the context statement as one non-interactive transaction — a single
 * round trip — so the role switch can never leak to another request.
 */
let sql: NeonQueryFunction<false, false> | null = null;

function client(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (!sql) sql = neon(url);
  return sql;
}

export const neonExecutor: Executor = {
  async run<T>(text: string, params: unknown[], userId: string | null): Promise<T[]> {
    const db = client();
    if (userId === null) {
      return (await db.query(text, params)) as T[];
    }
    const results = await db.transaction([db.query(USER_CONTEXT_SQL, [claimsFor(userId)]), db.query(text, params)]);
    return results[1] as T[];
  },
};

export function userDb(userId: string): UserDb {
  return new UserDb(neonExecutor, userId);
}

/** Owner access — only for the auth.* functions (sign-in, sessions). */
export function systemQuery<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return neonExecutor.run<T>(text, params, null);
}
