-- BSL Connect — administrators who also take part as students
--
-- Administration becomes a flag (user_roles.is_admin) independent of the
-- participation role:
--   role = 'student', is_admin = false  → ordinary student
--   role = 'student', is_admin = true   → student who also administers
--   role = 'admin',   is_admin = true   → staff administrator (no profile)
--
-- Conflict-of-interest rules for a participating admin, enforced in the
-- database (not just hidden in the UI):
--   * cannot suspend/reinstate, remove the photo of, or delete their own account;
--   * cannot review reports about themselves or filed by themselves;
--   * cannot cancel or dismiss review of a partnership they are part of;
--   * cannot see reports, moderation notes or audit entries about themselves.
-- Another administrator handles anything involving them.

alter table public.user_roles add column is_admin boolean not null default false;
update public.user_roles set is_admin = true where role = 'admin';

-- Student-domain admins become participating students with a profile.
update public.user_roles r set role = 'student'
from auth.users u
where u.id = r.user_id and r.role = 'admin' and private.is_allowed_student_email(u.email);
insert into public.profiles (id)
select r.user_id from public.user_roles r where r.role = 'student'
on conflict (id) do nothing;

alter table public.user_roles
  add constraint user_roles_staff_are_admins check (role <> 'admin' or is_admin);

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------
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
      and r.is_admin
      and u.email_confirmed_at is not null
  );
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff boolean := exists (select 1 from public.staff_allowlist s where s.email = lower(btrim(new.email)));
begin
  if private.is_allowed_student_email(new.email) then
    insert into public.user_roles (user_id, role, is_admin) values (new.id, 'student', v_staff)
    on conflict (user_id) do nothing;
    insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;
  elsif v_staff then
    insert into public.user_roles (user_id, role, is_admin) values (new.id, 'admin', true)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

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
    if private.is_allowed_student_email(v_email) then
      insert into public.user_roles (user_id, role, is_admin) values (v_user, 'student', true)
      on conflict (user_id) do update set is_admin = true;
    else
      insert into public.user_roles (user_id, role, is_admin) values (v_user, 'admin', true)
      on conflict (user_id) do update set role = 'admin', is_admin = true;
    end if;
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
    update public.user_roles set is_admin = false where user_id = v_user;
  else
    delete from public.user_roles where user_id = v_user;
    delete from auth.sessions where user_id = v_user;
  end if;
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
  values (null, 'admin_revoked', 'user', v_user, '{}'::jsonb);
  return 'admin access revoked';
end;
$$;

revoke execute on function private.provision_admin(text, text), private.revoke_admin(text) from public;

-- my_status gains is_admin.
create or replace function public.my_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_role text;
  v_profile public.profiles;
  v_partner_match uuid;
begin
  if me is null then
    return jsonb_build_object('authenticated', false);
  end if;
  v_role := private.user_role(me);
  select * into v_profile from public.profiles where id = me;
  select pm.match_id into v_partner_match from public.partnership_members pm where pm.student_id = me;
  return jsonb_build_object(
    'authenticated', true,
    'role', v_role,
    'is_admin', private.is_admin(),
    'profile_status', v_profile.status,
    'onboarding_step', v_profile.onboarding_step,
    'missing_fields', case when v_profile.id is null then '[]'::jsonb
                           else to_jsonb(private.profile_missing_fields(v_profile)) end,
    'suspended', private.is_suspended(me),
    'partnership_match_id', v_partner_match,
    'deletion_requested', exists (select 1 from public.account_deletion_requests d where d.user_id = me)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Self-moderation guards (data-level, so every admin RPC is covered)
-- ---------------------------------------------------------------------------
create or replace function private.forbid_self_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return coalesce(new, old);   -- owner scripts / migrations
  end if;
  -- Nested per table so record fields are only read on the table that has them.
  if tg_table_name = 'moderation_state' then
    if new.user_id = me then
      raise exception 'SELF_MODERATION' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'reports' then
    if me = old.reported_id or me = old.reporter_id then
      raise exception 'SELF_MODERATION' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'profile_photos' then
    if old.user_id = me then
      raise exception 'SELF_MODERATION' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'users' then
    if old.id = me then
      raise exception 'SELF_MODERATION' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'matches' then
    if me = old.student_low or me = old.student_high then
      if (old.status = 'finalised' and new.status = 'cancelled')
         or (old.cancellation_requested_at is not null and new.cancellation_requested_at is null) then
        raise exception 'SELF_MODERATION' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger bsl_no_self_moderation before insert or update on public.moderation_state
  for each row execute function private.forbid_self_moderation();
create trigger bsl_no_self_report_review before update on public.reports
  for each row execute function private.forbid_self_moderation();
create trigger bsl_no_self_photo_removal before delete on public.profile_photos
  for each row execute function private.forbid_self_moderation();
create trigger bsl_no_self_account_deletion before delete on auth.users
  for each row execute function private.forbid_self_moderation();
create trigger bsl_no_self_partnership_review before update on public.matches
  for each row execute function private.forbid_self_moderation();

-- admin_remove_photo blanks the profile before deleting the photo; check up
-- front so a self-removal fails before any change.
create or replace function public.admin_remove_photo(p_user uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user = auth.uid() then
    raise exception 'SELF_MODERATION' using errcode = 'P0001';
  end if;
  if private.blank(p_reason) then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  update public.profiles
  set photo_path = null, photo_confirmed = false, photo_updated_at = now(), status = 'draft', onboarding_step = 7
  where id = p_user;
  if not found then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;
  delete from public.profile_photos where user_id = p_user;
  delete from public.partnership_intents where student_id = p_user;
  perform private.audit('photo_removed', 'user', p_user, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('status', 'removed');
end;
$$;

-- ---------------------------------------------------------------------------
-- Visibility: an admin never sees reports, moderation notes or audit
-- entries about themselves.
-- ---------------------------------------------------------------------------
drop policy reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (private.is_admin() and auth.uid() is distinct from reported_id and auth.uid() is distinct from reporter_id);

drop policy report_events_select on public.report_events;
create policy report_events_select on public.report_events
  for select to authenticated
  using (private.is_admin() and exists (select 1 from public.reports r where r.id = report_events.report_id));

drop policy moderation_admin_select on public.moderation_state;
create policy moderation_admin_select on public.moderation_state
  for select to authenticated using (private.is_admin() and user_id <> auth.uid());

drop policy audit_admin_select on public.audit_log;
create policy audit_admin_select on public.audit_log
  for select to authenticated using (private.is_admin() and subject_id is distinct from auth.uid());

create or replace function public.admin_list_reports(p_status text default null)
returns table (
  id uuid,
  category text,
  explanation text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  resolution_note text,
  reported_id uuid,
  reported_name text,
  reported_email text,
  reporter_name text,
  events jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select r.id, r.category, r.explanation, r.status, r.created_at, r.updated_at, r.resolution_note,
           r.reported_id, rp.full_name, ru.email::text, rr.full_name,
           coalesce((
             select jsonb_agg(jsonb_build_object('action', e.action, 'note', e.note, 'created_at', e.created_at)
                              order by e.created_at)
             from public.report_events e where e.report_id = r.id), '[]'::jsonb)
    from public.reports r
    left join public.profiles rp on rp.id = r.reported_id
    left join auth.users ru on ru.id = r.reported_id
    left join public.profiles rr on rr.id = r.reporter_id
    where (p_status is null or r.status = p_status)
      and r.reported_id <> auth.uid()
      and r.reporter_id is distinct from auth.uid()
    order by case r.status when 'open' then 0 when 'in_review' then 1 else 2 end, r.created_at desc;
end;
$$;

create or replace function public.admin_student_account(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  v_self boolean := p_user = auth.uid();
begin
  perform private.require_admin();
  select jsonb_build_object(
    'email', u.email,
    'email_verified', u.email_confirmed_at is not null,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'role', private.user_role(u.id),
    'is_self', v_self,
    'suspended', private.is_suspended(u.id),
    'suspension_reason', case when v_self then null
                              else (select m.reason from public.moderation_state m where m.user_id = u.id) end,
    'likes_given', (select count(*) from public.likes l where l.liker_id = u.id),
    'likes_received', case when v_self then null
                           else (select count(*) from public.likes l where l.target_id = u.id) end,
    'deletion_requested_at', (select d.created_at from public.account_deletion_requests d where d.user_id = u.id),
    'missing_fields', (select to_jsonb(private.profile_missing_fields(p)) from public.profiles p where p.id = u.id)
  ) into result
  from auth.users u where u.id = p_user;
  return result;
end;
$$;

-- Overview: reports involving the viewing admin are counted separately.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  me uuid := auth.uid();
begin
  perform private.require_admin();
  with students as (
    select r.user_id, u.email_confirmed_at, p.status,
           private.is_suspended(r.user_id) as suspended,
           private.is_partnered(r.user_id) as partnered
    from public.user_roles r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    where r.role = 'student'
  )
  select jsonb_build_object(
    'total_students', (select count(*) from students),
    'verified_students', (select count(*) from students where email_confirmed_at is not null),
    'completed_profiles', (select count(*) from students where status = 'published'),
    'incomplete_profiles', (select count(*) from students where status is distinct from 'published'),
    'active_in_discovery', (select count(*) from students where status = 'published' and not suspended and not partnered),
    'suspended', (select count(*) from students where suspended),
    'students_with_likes', (select count(distinct l.liker_id) from public.likes l),
    'mutual_matches_total', (select count(*) from public.matches),
    'open_matches', (select count(*) from public.matches where status in ('mutual', 'pending_confirmation')),
    'pending_confirmations', (select count(*) from public.matches where status = 'pending_confirmation'),
    'finalised_partnerships', (select count(*) from public.matches where status = 'finalised'),
    'students_partnered', (select count(*) from public.partnership_members),
    'students_with_match', (
      select count(distinct s) from (
        select student_low as s from public.matches union all select student_high from public.matches
      ) x),
    'outstanding_reports', (select count(*) from public.reports
                            where status in ('open', 'in_review') and reported_id <> me and reporter_id is distinct from me),
    'reports_involving_you', (select count(*) from public.reports
                              where status in ('open', 'in_review') and (reported_id = me or reporter_id = me)),
    'cancellation_requests', (select count(*) from public.matches where status = 'finalised' and cancellation_requested_at is not null),
    'deletion_requests', (select count(*) from public.account_deletion_requests)
  ) into result;
  return result;
end;
$$;
