-- BSL Connect — administrator RPCs
-- Every function re-checks private.is_admin() server-side. Hiding admin UI is
-- never the protection. All moderation actions write to audit_log.

create or replace function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Overview metrics (all derived from live records)
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
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
    'outstanding_reports', (select count(*) from public.reports where status in ('open', 'in_review')),
    'cancellation_requests', (select count(*) from public.matches where status = 'finalised' and cancellation_requested_at is not null),
    'deletion_requests', (select count(*) from public.account_deletion_requests)
  ) into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Student directory (includes email, visible to admins only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_students(p_search text default null, p_filter text default 'all')
returns table (
  id uuid,
  email text,
  full_name text,
  role_title text,
  cohort text,
  status text,
  missing_count int,
  email_verified boolean,
  suspended boolean,
  partnered boolean,
  likes_given int,
  open_matches int,
  industries_interest text[],
  strengths text[],
  created_at timestamptz,
  last_sign_in_at timestamptz,
  deletion_requested boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform private.require_admin();
  return query
    select p.id, u.email::text, p.full_name, p.role_title, p.cohort, p.status,
           cardinality(private.profile_missing_fields(p))::int,
           u.email_confirmed_at is not null,
           private.is_suspended(p.id),
           private.is_partnered(p.id),
           (select count(*) from public.likes l where l.liker_id = p.id)::int,
           (select count(*) from public.matches m
             where p.id in (m.student_low, m.student_high) and m.status in ('mutual', 'pending_confirmation'))::int,
           p.industries_interest, p.strengths, p.created_at, u.last_sign_in_at,
           exists (select 1 from public.account_deletion_requests d where d.user_id = p.id)
    from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role = 'student'
    join auth.users u on u.id = p.id
    where (v_search is null
           or p.full_name ilike '%' || v_search || '%'
           or u.email ilike '%' || v_search || '%'
           or p.role_title ilike '%' || v_search || '%')
      and case coalesce(p_filter, 'all')
            when 'complete' then p.status = 'published'
            when 'incomplete' then p.status <> 'published'
            when 'suspended' then private.is_suspended(p.id)
            when 'unpartnered' then p.status = 'published' and not private.is_partnered(p.id)
            when 'partnered' then private.is_partnered(p.id)
            else true
          end
    order by p.full_name nulls last, u.email;
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
begin
  perform private.require_admin();
  select jsonb_build_object(
    'email', u.email,
    'email_verified', u.email_confirmed_at is not null,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'role', private.user_role(u.id),
    'suspended', private.is_suspended(u.id),
    'suspension_reason', (select m.reason from public.moderation_state m where m.user_id = u.id),
    'likes_given', (select count(*) from public.likes l where l.liker_id = u.id),
    'likes_received', (select count(*) from public.likes l where l.target_id = u.id),
    'deletion_requested_at', (select d.created_at from public.account_deletion_requests d where d.user_id = u.id),
    'missing_fields', (select to_jsonb(private.profile_missing_fields(p)) from public.profiles p where p.id = u.id)
  ) into result
  from auth.users u where u.id = p_user;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_suspension(p_user uuid, p_suspended boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if private.user_role(p_user) is distinct from 'student' then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if p_suspended and private.blank(p_reason) then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  perform private.lock_students(p_user);
  insert into public.moderation_state (user_id, suspended, reason, updated_by, updated_at)
  values (p_user, p_suspended, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid(), now())
  on conflict (user_id) do update
    set suspended = excluded.suspended, reason = excluded.reason,
        updated_by = excluded.updated_by, updated_at = now();
  if p_suspended then
    -- A suspended student's outstanding confirmations are withdrawn.
    delete from public.partnership_intents where student_id = p_user;
  end if;
  perform private.audit(case when p_suspended then 'profile_suspended' else 'profile_reinstated' end,
                        'user', p_user, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('status', case when p_suspended then 'suspended' else 'reinstated' end);
end;
$$;

-- Deletes the photo and unpublishes the profile (a photo is required to
-- publish) until the student uploads a new one.
create or replace function public.admin_remove_photo(p_user uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
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

create or replace function public.admin_update_report(p_report uuid, p_status text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform private.require_admin();
  if p_status not in ('open', 'in_review', 'resolved', 'dismissed') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  if p_status in ('resolved', 'dismissed') and private.blank(p_note) then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  select r.status into v_old from public.reports r where r.id = p_report for update;
  if v_old is null then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.reports
  set status = p_status,
      resolution_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), resolution_note),
      resolved_by = case when p_status in ('resolved', 'dismissed') then auth.uid() else resolved_by end
  where id = p_report;
  insert into public.report_events (report_id, actor_id, action, note)
  values (p_report, auth.uid(), 'status:' || v_old || '->' || p_status, nullif(btrim(coalesce(p_note, '')), ''));
  perform private.audit('report_updated', 'report', p_report,
                        jsonb_build_object('from', v_old, 'to', p_status));
  return jsonb_build_object('status', p_status);
end;
$$;

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
    where p_status is null or r.status = p_status
    order by case r.status when 'open' then 0 when 'in_review' then 1 else 2 end, r.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Partnerships
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_matches(p_status text default null)
returns table (
  id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  finalised_at timestamptz,
  closed_reason text,
  student_low uuid,
  student_high uuid,
  low_name text,
  high_name text,
  low_confirmed boolean,
  high_confirmed boolean,
  cancellation_requested_at timestamptz,
  cancellation_reason text,
  cancellation_requested_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select m.id, m.status, m.created_at, m.updated_at, m.finalised_at, m.closed_reason,
           m.student_low, m.student_high, pl.full_name, ph.full_name,
           exists (select 1 from public.partnership_intents i where i.student_id = m.student_low and i.match_id = m.id),
           exists (select 1 from public.partnership_intents i where i.student_id = m.student_high and i.match_id = m.id),
           m.cancellation_requested_at, m.cancellation_reason, pc.full_name
    from public.matches m
    join public.profiles pl on pl.id = m.student_low
    join public.profiles ph on ph.id = m.student_high
    left join public.profiles pc on pc.id = m.cancellation_requested_by
    where p_status is null or m.status = p_status
    order by (m.cancellation_requested_at is not null and m.status = 'finalised') desc, m.updated_at desc;
end;
$$;

-- Cancels a finalised partnership (exceptional, audited). Matches that were
-- closed only because one of these students finalised are reopened where the
-- other participant is still available.
create or replace function public.admin_cancel_partnership(p_match uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_low uuid;
  v_high uuid;
  v_status text;
begin
  perform private.require_admin();
  if private.blank(p_note) then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  select m.student_low, m.student_high into v_low, v_high from public.matches m where m.id = p_match;
  if v_low is null then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  perform private.lock_students(v_low, v_high);
  select m.status into v_status from public.matches m where m.id = p_match for update;
  if v_status <> 'finalised' then
    raise exception 'MATCH_NOT_FINALISED' using errcode = 'P0001';
  end if;

  delete from public.partnership_members where match_id = p_match;
  update public.matches
  set status = 'cancelled', closed_reason = 'cancelled_by_admin', ended_by = auth.uid(), ended_at = now()
  where id = p_match;

  update public.matches m
  set status = 'mutual', closed_reason = null, ended_at = null
  where m.status = 'closed'
    and m.closed_reason = 'partner_finalised_elsewhere'
    and (m.student_low in (v_low, v_high) or m.student_high in (v_low, v_high))
    and not private.is_partnered(m.student_low)
    and not private.is_partnered(m.student_high);

  perform private.audit('partnership_cancelled', 'match', p_match, jsonb_build_object('note', p_note));
  return jsonb_build_object('status', 'cancelled');
end;
$$;

create or replace function public.admin_dismiss_cancellation_request(p_match uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if private.blank(p_note) then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  update public.matches
  set cancellation_requested_by = null, cancellation_reason = null, cancellation_requested_at = null
  where id = p_match and status = 'finalised' and cancellation_requested_at is not null;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  perform private.audit('partnership_cancellation_dismissed', 'match', p_match, jsonb_build_object('note', p_note));
  return jsonb_build_object('status', 'dismissed');
end;
$$;

-- ---------------------------------------------------------------------------
-- CSV export rows: permitted cohort and partnership fields only.
-- No auth metadata beyond email, no likes, no reports, no moderation notes.
-- ---------------------------------------------------------------------------
create or replace function public.admin_export_rows()
returns table (
  full_name text,
  email text,
  cohort text,
  role_title text,
  profile_status text,
  career_objective text,
  strengths text,
  industries_experience text,
  industries_interest text,
  partnership_status text,
  partner_name text,
  partner_email text,
  finalised_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform private.audit('cohort_exported', 'cohort', null, '{}'::jsonb);
  return query
    select p.full_name, u.email::text, p.cohort, p.role_title, p.status, p.career_objective,
           array_to_string(p.strengths, '; '), array_to_string(p.industries_experience, '; '),
           array_to_string(p.industries_interest, '; '),
           case when pm.match_id is not null then 'finalised' else 'not finalised' end,
           pp.full_name, pu.email::text, m.finalised_at
    from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role = 'student'
    join auth.users u on u.id = p.id
    left join public.partnership_members pm on pm.student_id = p.id
    left join public.matches m on m.id = pm.match_id
    left join public.profiles pp on pp.id = case when m.student_low = p.id then m.student_high else m.student_low end
    left join auth.users pu on pu.id = pp.id
    order by p.full_name nulls last;
end;
$$;

create or replace function public.admin_list_deletion_requests()
returns table (user_id uuid, full_name text, email text, reason text, created_at timestamptz, partnered boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select d.user_id, p.full_name, u.email::text, d.reason, d.created_at, private.is_partnered(d.user_id)
    from public.account_deletion_requests d
    join public.profiles p on p.id = d.user_id
    join auth.users u on u.id = d.user_id
    order by d.created_at;
end;
$$;

-- Completes a requested account removal. Refuses while the student is in a
-- finalised partnership. Deleting the auth user cascades to every row the
-- student owns (profile, photo, likes, passes, ranks, matches, sessions…).
-- The audit entry has no foreign key and survives.
create or replace function public.admin_delete_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if private.user_role(p_user) is distinct from 'student' then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.account_deletion_requests d where d.user_id = p_user) then
    raise exception 'DELETION_NOT_REQUESTED' using errcode = 'P0001';
  end if;
  if private.is_partnered(p_user) then
    raise exception 'ALREADY_PARTNERED' using errcode = 'P0001';
  end if;
  perform private.audit('account_deleted', 'user', p_user, '{}'::jsonb);
  delete from auth.users where id = p_user;
  return jsonb_build_object('status', 'deleted');
end;
$$;

revoke execute on function
  public.admin_overview(), public.admin_list_students(text, text), public.admin_student_account(uuid),
  public.admin_set_suspension(uuid, boolean, text), public.admin_remove_photo(uuid, text),
  public.admin_update_report(uuid, text, text), public.admin_list_reports(text),
  public.admin_list_matches(text), public.admin_cancel_partnership(uuid, text),
  public.admin_dismiss_cancellation_request(uuid, text), public.admin_export_rows(),
  public.admin_list_deletion_requests(), public.admin_delete_account(uuid)
from public, anon;

grant execute on function
  public.admin_overview(), public.admin_list_students(text, text), public.admin_student_account(uuid),
  public.admin_set_suspension(uuid, boolean, text), public.admin_remove_photo(uuid, text),
  public.admin_update_report(uuid, text, text), public.admin_list_reports(text),
  public.admin_list_matches(text), public.admin_cancel_partnership(uuid, text),
  public.admin_dismiss_cancellation_request(uuid, text), public.admin_export_rows(),
  public.admin_list_deletion_requests(), public.admin_delete_account(uuid)
to authenticated;
