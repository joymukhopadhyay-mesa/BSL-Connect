// Grants administrator access to an email address.
//   npm run admin:grant -- coordinator@example.com
// If the person has not signed in yet, the email is allowlisted and becomes
// an admin on first sign-in. Runs as the database owner; there is no
// in-app way to self-promote.

import pg from "pg";

const email = process.argv[2];
const revoke = process.argv.includes("--revoke");
const participate = process.argv.includes("--participate");
if (!email || !email.includes("@")) {
  console.error("Usage: npm run admin:grant -- <email> [--participate] [--revoke]");
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const fn = revoke ? "private.revoke_admin($1)" : "private.provision_admin($1, 'provisioned via script', $2)";
  const { rows } = await client.query(`select ${fn} as result`, revoke ? [email.trim().toLowerCase()] : [email.trim().toLowerCase(), participate]);
  console.log(`${email}: ${rows[0].result}`);
} finally {
  await client.end();
}
