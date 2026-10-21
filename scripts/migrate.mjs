// Applies pending SQL migrations from db/migrations in filename order.
// Each migration runs in its own transaction and is recorded in
// private.schema_migrations, so re-running is safe.
//
//   npm run db:migrate            (reads DATABASE_URL from .env.local or the environment)

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const dir = path.resolve(import.meta.dirname, "..", "db", "migrations");
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("create schema if not exists private");
  await client.query(
    "create table if not exists private.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = new Set((await client.query("select name from private.schema_migrations")).rows.map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    process.stdout.write(`applying ${file} … `);
    await client.query("begin");
    try {
      await client.query(readFileSync(path.join(dir, file), "utf8"));
      await client.query("insert into private.schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("done");
      count++;
    } catch (error) {
      await client.query("rollback");
      console.log("FAILED");
      throw error;
    }
  }
  console.log(count ? `Applied ${count} migration(s).` : "Database is up to date.");
} finally {
  await client.end();
}
