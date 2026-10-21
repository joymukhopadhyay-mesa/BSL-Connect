/**
 * Database access primitives shared by the server and the tests.
 *
 * Security model: the app connects as the database owner, which bypasses
 * RLS. Every user-scoped statement therefore runs inside a transaction that
 * first executes USER_CONTEXT_SQL — setting the user's id in
 * `request.jwt.claims` (read by auth.uid()) and switching to the restricted
 * `authenticated` role for that transaction only. RLS, column grants and RPC
 * checks then apply exactly as designed. Owner ("system") access is used only
 * for the auth tables, through dedicated functions.
 */

export const USER_CONTEXT_SQL =
  "select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)";

export function claimsFor(userId: string): string {
  return JSON.stringify({ sub: userId, role: "authenticated" });
}

export interface Executor {
  /** Run one statement. With a userId it runs under that user's RLS context; with null, as the owner. */
  run<T = Record<string, unknown>>(text: string, params: unknown[], userId: string | null): Promise<T[]>;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Named-argument call: select public.fn(p_a => $1, p_b => $2) — argument names are whitelisted identifiers. */
export function rpcCall(fn: string, args: Record<string, unknown>): { call: string; params: unknown[] } {
  if (!IDENT.test(fn)) throw new Error(`Invalid function name: ${fn}`);
  const keys = Object.keys(args);
  for (const k of keys) if (!IDENT.test(k)) throw new Error(`Invalid argument name: ${k}`);
  const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
  return { call, params: keys.map((k) => args[k]) };
}

/** Database handle bound to one signed-in user. Every call is RLS-scoped to that user. */
export class UserDb {
  constructor(
    private readonly exec: Executor,
    readonly userId: string,
  ) {}

  query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    return this.exec.run<T>(text, params, this.userId);
  }

  async maybeOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  /** Scalar-returning function (jsonb, boolean, void). */
  async rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { call, params } = rpcCall(fn, args);
    const rows = await this.query<{ result: T }>(`select ${call} as result`, params);
    return rows[0]?.result as T;
  }

  /** Set-returning function (returns table / setof). */
  rpcRows<T = Record<string, unknown>>(fn: string, args: Record<string, unknown> = {}): Promise<T[]> {
    const { call, params } = rpcCall(fn, args);
    return this.query<T>(`select * from ${call}`, params);
  }
}
