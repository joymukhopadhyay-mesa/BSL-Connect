-- BSL Connect — helper functions and triggers
-- Helpers live in the `private` schema. The ones used inside RLS policies are
-- SECURITY DEFINER so a policy can consult admin-only tables without
-- exposing them.

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------

create or replace function private.user_role(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.role from public.user_roles r where r.user_id = p_user;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    join auth.users u on u.id = r.user_id
    where r.user_id = auth.uid()
      and r.role = 'admin'
      and u.email_confirmed_at is not null
  );
$$;

create or replace function private.is_suspended(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.suspended from public.moderation_state m where m.user_id = p_user), false);
$$;

create or replace function private.is_partnered(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.partnership_members pm where pm.student_id = p_user);
$$;

-- A verified student with a published, non-suspended profile.
create or replace function private.is_active_student(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role = 'student'
    join auth.users u on u.id = p.id and u.email_confirmed_at is not null
    where p.id = p_user
      and p.status = 'published'
      and not private.is_suspended(p.id)
  );
$$;

-- The current user may browse cohort profiles.
create or replace function private.can_browse()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_student(auth.uid());
$$;

-- True when the current user shares a match (any state) with p_other.
create or replace function private.shares_match_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches m
    where m.student_low = least(auth.uid(), p_other)
      and m.student_high = greatest(auth.uid(), p_other)
  );
$$;

-- Serialise all state changes that involve the given students. Locks are
-- always taken in ascending key order, so concurrent transactions touching
-- overlapping students cannot deadlock. Every RPC that changes likes,
-- matches, intents or partnerships takes these locks BEFORE any row lock.
create or replace function private.lock_students(p_a uuid, p_b uuid default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  k1 bigint := hashtextextended('bsl-student:' || p_a::text, 0);
  k2 bigint;
begin
  if p_b is null then
    perform pg_advisory_xact_lock(k1);
    return;
  end if;
  k2 := hashtextextended('bsl-student:' || p_b::text, 0);
  perform pg_advisory_xact_lock(least(k1, k2));
  if k1 <> k2 then
    perform pg_advisory_xact_lock(greatest(k1, k2));
  end if;
end;
$$;

create or replace function private.audit(
  p_action text, p_subject_type text, p_subject uuid, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
  values (auth.uid(), p_action, p_subject_type, p_subject, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- Profile completeness — the single source of truth for publication.
-- Mirrored in src/lib/profile/completion.ts for UI hints; tests assert both
-- implementations agree.
-- ---------------------------------------------------------------------------

create or replace function private.blank(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(coalesce(p, '')), '') is null;
$$;

create or replace function private.profile_missing_fields(p public.profiles)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  missing text[] := '{}';
  q jsonb := coalesce(p.questionnaire, '{}'::jsonb);
  k text;
  v jsonb;
begin
  if private.blank(p.full_name) then missing := array_append(missing, 'full_name'); end if;
  if private.blank(p.role_title) then missing := array_append(missing, 'role_title'); end if;
  if private.blank(p.background) then missing := array_append(missing, 'background'); end if;
  if private.blank(p.career_objective) then missing := array_append(missing, 'career_objective'); end if;
  if private.blank(p.intro) then missing := array_append(missing, 'intro'); end if;
  if coalesce(cardinality(p.strengths), 0) = 0 then missing := array_append(missing, 'strengths'); end if;
  if private.blank(p.strengths_good_at) then missing := array_append(missing, 'strengths_good_at'); end if;
  if coalesce(cardinality(p.development_areas), 0) = 0 then missing := array_append(missing, 'development_areas'); end if;
  if private.blank(p.development_current) then missing := array_append(missing, 'development_current'); end if;
  if coalesce(cardinality(p.industries_interest), 0) = 0 then missing := array_append(missing, 'industries_interest'); end if;

  foreach k in array array['working_style', 'decision_making', 'communication', 'ownership', 'ambiguity',
                           'conflict', 'feedback', 'execution', 'pressure', 'expectations'] loop
    v := q -> 'answers' -> k;
    if v is null
       or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
       or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0)
       or jsonb_typeof(v) not in ('string', 'array') then
      missing := array_append(missing, 'questionnaire.' || k);
    end if;
  end loop;

  if coalesce(cardinality(p.partner_skills), 0) = 0 then missing := array_append(missing, 'partner_skills'); end if;
  if coalesce(cardinality(p.partner_qualities), 0) = 0 then missing := array_append(missing, 'partner_qualities'); end if;
  if p.photo_path is null then missing := array_append(missing, 'photo'); end if;
  if not p.photo_confirmed then missing := array_append(missing, 'photo_confirmed'); end if;
  if not p.details_confirmed then missing := array_append(missing, 'details_confirmed'); end if;
  if not p.visibility_acknowledged then missing := array_append(missing, 'visibility_acknowledged'); end if;
  return missing;
end;
$$;

-- ---------------------------------------------------------------------------
-- auth.users triggers
-- ---------------------------------------------------------------------------

-- Domain enforcement on the accounts table itself, so no code path (sign-in
-- function, script, manual insert) can create a non-MESA account.
create or replace function private.enforce_signup_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_allowed_student_email(new.email)
     or exists (select 1 from public.staff_allowlist s where s.email = lower(btrim(new.email))) then
    return new;
  end if;
  raise exception 'EMAIL_DOMAIN_NOT_ALLOWED'
    using errcode = 'P0001',
          hint = 'BSL Connect accepts @pg27.mesaschool.co email addresses only.';
end;
$$;

create trigger bsl_enforce_signup_domain
  before insert or update of email on auth.users
  for each row execute function private.enforce_signup_domain();

-- Every new account gets a role (never from client input) and, for students,
-- an empty draft profile.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.staff_allowlist s where s.email = lower(btrim(new.email))) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
    on conflict (user_id) do nothing;
  else
    insert into public.user_roles (user_id, role) values (new.id, 'student')
    on conflict (user_id) do nothing;
    insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger bsl_handle_new_user
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Profile write guard
-- ---------------------------------------------------------------------------

create or replace function private.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  missing text[];
begin
  if new.id <> old.id then
    raise exception 'IMMUTABLE_FIELD' using errcode = 'P0001';
  end if;

  new.updated_at := now();
  if (to_jsonb(new) - array['updated_at', 'version', 'onboarding_step', 'published_at'])
     is distinct from (to_jsonb(old) - array['updated_at', 'version', 'onboarding_step', 'published_at']) then
    new.version := old.version + 1;
  end if;

  -- Publication (and staying published) requires a complete profile.
  if new.status = 'published' then
    if old.status <> 'published'
       and exists (select 1 from public.account_deletion_requests d where d.user_id = new.id) then
      raise exception 'DELETION_REQUESTED' using errcode = 'P0001';
    end if;
    missing := private.profile_missing_fields(new);
    if cardinality(missing) > 0 then
      raise exception 'PROFILE_INCOMPLETE'
        using errcode = 'P0001', detail = array_to_string(missing, ',');
    end if;
    if old.status <> 'published' then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger bsl_profiles_before_update
  before update on public.profiles
  for each row execute function private.profiles_before_update();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger bsl_matches_touch before update on public.matches
  for each row execute function private.touch_updated_at();
create trigger bsl_reports_touch before update on public.reports
  for each row execute function private.touch_updated_at();
create trigger bsl_roles_touch before update on public.user_roles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Administrator provisioning (run as the database owner, e.g. the Neon SQL
-- editor or `npm run admin:grant -- <email>`). Not executable by API roles.
--   select private.provision_admin('coordinator@mesaschool.co');
-- ---------------------------------------------------------------------------

create or replace function private.provision_admin(p_email text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_user uuid;
begin
  if v_email is null or position('@' in v_email) < 2 then
    raise exception 'INVALID_EMAIL';
  end if;

  insert into public.staff_allowlist (email, note) values (v_email, p_note)
  on conflict (email) do update set note = coalesce(excluded.note, public.staff_allowlist.note);

  select u.id into v_user from auth.users u where u.email = v_email;
  if v_user is not null then
    insert into public.user_roles (user_id, role) values (v_user, 'admin')
    on conflict (user_id) do update set role = 'admin';
    insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (null, 'admin_provisioned', 'user', v_user, jsonb_build_object('via', 'provision_admin'));
    return 'existing account promoted to admin';
  end if;
  return 'allowlisted; the account becomes admin on first sign-in';
end;
$$;

create or replace function private.revoke_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_user uuid;
begin
  delete from public.staff_allowlist where email = v_email;
  select u.id into v_user from auth.users u where u.email = v_email;
  if v_user is null then
    return 'removed from allowlist';
  end if;
  if private.is_allowed_student_email(v_email) then
    update public.user_roles set role = 'student' where user_id = v_user;
    insert into public.profiles (id) values (v_user) on conflict (id) do nothing;
  else
    delete from public.user_roles where user_id = v_user;
    delete from auth.sessions where user_id = v_user;
  end if;
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
  values (null, 'admin_revoked', 'user', v_user, '{}'::jsonb);
  return 'admin role revoked';
end;
$$;
