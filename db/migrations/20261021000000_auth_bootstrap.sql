-- BSL Connect — roles and the auth schema (Neon / plain Postgres)
--
-- The app connects as the database owner. For every user-scoped query it
-- opens a transaction and switches to the `authenticated` role with the
-- user's id in `request.jwt.claims` (see src/lib/db/context.ts). Row Level
-- Security then applies exactly as it would behind PostgREST.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end;
$$;

-- Allow the owner to SET ROLE authenticated without inheriting its privileges.
grant authenticated to current_user with inherit false, set true;
grant anon to current_user with inherit false, set true;

create schema if not exists auth;
revoke all on schema auth from public;
grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;

-- Accounts. Emails are stored lower-cased; verification happens through the
-- one-time code flow, so a row exists only after a successful verification.
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and position('@' in email) > 1),
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now()
);

-- One-time sign-in codes. Only an HMAC of the code is stored.
create table auth.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email))),
  code_hash text not null,
  ip_hash text,
  attempts smallint not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index otp_codes_email_idx on auth.otp_codes (email, created_at desc);
create index otp_codes_ip_idx on auth.otp_codes (ip_hash, created_at desc);

-- Server-side sessions. The cookie holds a random token; only its SHA-256
-- hash is stored, so a database read does not reveal usable tokens.
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on auth.sessions (user_id);

-- No API role may touch auth tables directly.
revoke all on all tables in schema auth from public, anon, authenticated;

-- Identity of the current request, read from the claims set by the app.
create or replace function auth.uid() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), '')::uuid;
$$;

create or replace function auth.jwt() returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

revoke all on function auth.uid(), auth.jwt() from public;
grant execute on function auth.uid(), auth.jwt() to authenticated, anon;
