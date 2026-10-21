import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { USER_CONTEXT_SQL, claimsFor, type Executor } from "../../src/lib/db/executor";

const root = path.resolve(import.meta.dirname, "..", "..");
const migrationsDir = path.join(root, "db", "migrations");

export type Db = PGlite;

/** Fresh Postgres (PGlite) with every production migration applied in order. */
export async function createDb(): Promise<Db> {
  const db = new PGlite();
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

/**
 * Executor with the same semantics as the production Neon executor: a
 * user-scoped statement runs in a transaction that first executes
 * USER_CONTEXT_SQL. Used to test the real data-access path.
 */
export function pgliteExecutor(db: Db): Executor {
  return {
    async run<T>(text: string, params: unknown[], userId: string | null): Promise<T[]> {
      if (userId === null) return (await db.query<T>(text, params)).rows;
      return db.transaction(async (tx) => {
        await tx.query(USER_CONTEXT_SQL, [claimsFor(userId)]);
        return (await tx.query<T>(text, params)).rows;
      });
    },
  };
}

/**
 * Run `fn` as a request from `userId` — the role and claims the app sets —
 * so RLS, column grants and RPC checks all apply. `null` runs as `anon`.
 */
export async function asUser<T>(db: Db, userId: string | null, fn: () => Promise<T>): Promise<T> {
  const claims = userId ? claimsFor(userId) : "";
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  await db.exec(userId ? "set role authenticated" : "set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

export async function rpc<T = Record<string, unknown>>(
  db: Db,
  userId: string | null,
  fn: string,
  args: unknown[] = [],
): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  return asUser(db, userId, async () => {
    const res = await db.query<{ result: T }>(`select public.${fn}(${placeholders}) as result`, args);
    return res.rows[0]!.result;
  });
}

let counter = 0;

export async function createUser(
  db: Db,
  opts: { email?: string; confirmed?: boolean } = {},
): Promise<string> {
  counter += 1;
  const email = (opts.email ?? `student${counter}.${Date.now()}@pg27.mesaschool.co`).trim().toLowerCase();
  const res = await db.query<{ id: string }>(
    "insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id",
    [email, opts.confirmed === false ? null : new Date().toISOString()],
  );
  return res.rows[0]!.id;
}

export const completeAnswers = {
  answers: {
    working_style: "structured",
    decision_making: ["data"],
    communication: "direct",
    ownership: "mixed",
    ambiguity: "comfortable",
    conflict: "address_directly",
    feedback: ["direct_immediate"],
    execution: "plan_ahead",
    pressure: ["clear_priorities"],
    expectations: ["reliability"],
  },
  notes: {},
};

/** A tiny valid JPEG header, enough for the photo row. */
export const JPEG_BYTES_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]).toString("base64");

/** Fill every required field, attach a photo and (optionally) publish — as the owner. */
export async function completeProfile(db: Db, userId: string, opts: { publish?: boolean; name?: string } = {}) {
  await db.query(
    `insert into public.profile_photos (user_id, content_type, data) values ($1, 'image/jpeg', decode($2, 'base64'))
     on conflict (user_id) do nothing`,
    [userId, JPEG_BYTES_B64],
  );
  await db.query(
    `update public.profiles set
       full_name = $2, role_title = 'Analyst', background = 'Three years in consumer research.',
       career_objective = 'consulting', intro = 'I bring structure and curiosity.',
       strengths = array['Research','Strategy'], strengths_good_at = 'Turning messy data into a clear story.',
       development_areas = array['Finance'], development_current = 'Financial modelling.',
       industries_interest = array['Fintech and financial services'], industries_experience = array['Consulting'],
       questionnaire = $3::jsonb, partner_skills = array['Finance'], partner_qualities = array['Reliable'],
       photo_path = $1, photo_confirmed = true, details_confirmed = true, visibility_acknowledged = true
     where id = $4`,
    [`${userId}/avatar`, opts.name ?? "Student", JSON.stringify(completeAnswers), userId],
  );
  if (opts.publish !== false) {
    await db.query("update public.profiles set status = 'published' where id = $1", [userId]);
  }
}

export async function createStudent(db: Db, name = "Student"): Promise<string> {
  const id = await createUser(db);
  await completeProfile(db, id, { name });
  return id;
}

export async function createAdmin(db: Db): Promise<string> {
  counter += 1;
  const email = `coordinator${counter}@mesaschool.co`;
  await db.query("select private.provision_admin($1)", [email]);
  return createUser(db, { email });
}

/** Extract the P0001 error code raised by an RPC. */
export async function errorCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}
