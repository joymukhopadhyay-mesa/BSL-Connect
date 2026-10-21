-- BSL Connect — email one-time-code sign-in and sessions
--
-- Called only by the server as the database owner (never by API roles).
-- The server hashes codes with an HMAC secret and session tokens with
-- SHA-256 before they reach the database, so neither is stored in usable form.

-- Issue a code. Enforces eligibility, a 60-second resend gap, and hourly
-- limits per email and per (hashed) IP. Earlier unused codes are invalidated.
create or replace function auth.request_otp(
  p_email text, p_code_hash text, p_ip_hash text, p_ttl_seconds int default 600)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_last timestamptz;
  v_id uuid;
begin
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not (private.is_allowed_student_email(v_email)
          or exists (select 1 from public.staff_allowlist s where s.email = v_email)) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bsl-otp:' || v_email, 0));

  select max(created_at) into v_last from auth.otp_codes where email = v_email;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return jsonb_build_object('status', 'too_soon',
      'retry_after', ceil(extract(epoch from (v_last + interval '60 seconds' - now())))::int);
  end if;
  if (select count(*) from auth.otp_codes where email = v_email and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if p_ip_hash is not null
     and (select count(*) from auth.otp_codes where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  update auth.otp_codes set consumed_at = now() where email = v_email and consumed_at is null;
  delete from auth.otp_codes where created_at < now() - interval '1 day';

  insert into auth.otp_codes (email, code_hash, ip_hash, expires_at)
  values (v_email, p_code_hash, p_ip_hash, now() + make_interval(secs => greatest(60, least(p_ttl_seconds, 1800))))
  returning id into v_id;
  return jsonb_build_object('status', 'ok', 'id', v_id);
end;
$$;

-- Undo a code that could not be emailed, so the resend gap doesn't block retry.
create or replace function auth.discard_otp(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.otp_codes where id = p_id;
$$;

-- Verify a code and, on success, create the account (first time) and a
-- session. Five wrong attempts lock the code. Runs atomically.
create or replace function auth.verify_otp(
  p_email text, p_code_hash text, p_token_hash text, p_session_ttl_seconds int default 2592000, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_code auth.otp_codes;
  v_user uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('bsl-otp:' || v_email, 0));

  select * into v_code from auth.otp_codes
  where email = v_email and consumed_at is null
  order by created_at desc
  limit 1
  for update;

  if v_code.id is null or v_code.expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_code.attempts >= 5 then
    return jsonb_build_object('status', 'locked');
  end if;
  if v_code.code_hash <> p_code_hash then
    update auth.otp_codes set attempts = attempts + 1 where id = v_code.id;
    return jsonb_build_object('status', 'invalid', 'attempts_left', greatest(0, 4 - v_code.attempts));
  end if;

  update auth.otp_codes set consumed_at = now() where id = v_code.id;

  -- First sign-in creates the account; the domain trigger is the final guard.
  insert into auth.users (email, email_confirmed_at, last_sign_in_at)
  values (v_email, now(), now())
  on conflict (email) do update
    set last_sign_in_at = now(),
        email_confirmed_at = coalesce(auth.users.email_confirmed_at, now())
  returning id into v_user;

  delete from auth.sessions where user_id = v_user and expires_at < now();
  insert into auth.sessions (user_id, token_hash, user_agent, expires_at)
  values (v_user, p_token_hash, left(p_user_agent, 300),
          now() + make_interval(secs => greatest(3600, least(p_session_ttl_seconds, 7776000))));

  return jsonb_build_object('status', 'ok', 'user_id', v_user);
end;
$$;

-- Resolve a session token hash to a verified user (or nothing).
create or replace function auth.session_user(p_token_hash text)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.sessions s set last_seen_at = now()
  where s.token_hash = p_token_hash and s.last_seen_at < now() - interval '1 hour';
  return query
    select u.id, u.email
    from auth.sessions s
    join auth.users u on u.id = s.user_id
    where s.token_hash = p_token_hash
      and s.expires_at > now()
      and u.email_confirmed_at is not null;
end;
$$;

create or replace function auth.revoke_session(p_token_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where token_hash = p_token_hash;
$$;

-- Is this address allowed to request a code? (student domain or allowlisted staff)
create or replace function auth.email_is_eligible(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_allowed_student_email(p_email)
      or exists (select 1 from public.staff_allowlist s where s.email = lower(btrim(p_email)));
$$;

revoke all on function
  auth.request_otp(text, text, text, int), auth.discard_otp(uuid),
  auth.verify_otp(text, text, text, int, text), auth.session_user(text),
  auth.revoke_session(text), auth.email_is_eligible(text)
from public, anon, authenticated;
