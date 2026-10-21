-- BSL Connect — student RPCs
--
-- All functions are SECURITY DEFINER with an empty search_path, derive the
-- acting user from auth.uid() (never from a parameter), and raise stable
-- error codes (P0001 + message) that the app maps to friendly copy.
--
-- Concurrency: every function that changes likes, matches, intents or
-- partnerships first calls private.lock_students() for the students involved
-- (ordered advisory locks), then reads/writes rows. Combined with the primary
-- keys on partnership_intents/partnership_members and the unique pair on
-- matches, concurrent requests cannot produce duplicate matches or more than
-- one finalised partner per student.

-- ---------------------------------------------------------------------------
-- Status of the current user — used for routing.
-- ---------------------------------------------------------------------------
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
-- Discovery deck: published, non-suspended, unpartnered students the viewer
-- has not yet liked or passed. Never includes the viewer.
-- ---------------------------------------------------------------------------
create or replace function public.discovery_candidates()
returns setof public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if not private.is_active_student(me) then
    raise exception 'PROFILE_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if private.is_partnered(me) then
    return;
  end if;

  return query
    select p.*
    from public.profiles p
    where p.id <> me
      and private.is_active_student(p.id)
      and not private.is_partnered(p.id)
      and not exists (select 1 from public.likes l where l.liker_id = me and l.target_id = p.id)
      and not exists (select 1 from public.passes x where x.actor_id = me and x.target_id = p.id)
      and not exists (
        select 1 from public.matches m
        where m.student_low = least(me, p.id) and m.student_high = greatest(me, p.id)
      )
    order by p.published_at, p.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Like / pass
-- ---------------------------------------------------------------------------
create or replace function public.record_decision(p_target uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_inserted int;
  v_match_id uuid;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_decision not in ('like', 'pass') then
    raise exception 'INVALID_DECISION' using errcode = 'P0001';
  end if;
  if p_target is null or p_target = me then
    raise exception 'SELF_ACTION' using errcode = 'P0001';
  end if;

  perform private.lock_students(me, p_target);

  if not private.is_active_student(me) then
    raise exception 'PROFILE_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if private.is_partnered(me) then
    raise exception 'ALREADY_PARTNERED' using errcode = 'P0001';
  end if;
  if not private.is_active_student(p_target) or private.is_partnered(p_target) then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if p_decision = 'pass' then
    if exists (select 1 from public.likes where liker_id = me and target_id = p_target) then
      raise exception 'ALREADY_LIKED' using errcode = 'P0001';
    end if;
    insert into public.passes (actor_id, target_id) values (me, p_target)
    on conflict do nothing;
    get diagnostics v_inserted = row_count;
    return jsonb_build_object('status', case when v_inserted = 0 then 'duplicate' else 'passed' end);
  end if;

  -- Like. A like replaces an earlier pass (explicit revisit).
  delete from public.passes where actor_id = me and target_id = p_target;
  insert into public.likes (liker_id, target_id) values (me, p_target)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  -- Mutual like → exactly one match for the unordered pair.
  if exists (select 1 from public.likes where liker_id = p_target and target_id = me) then
    insert into public.matches (student_low, student_high)
    values (least(me, p_target), greatest(me, p_target))
    on conflict (student_low, student_high) do nothing
    returning id into v_match_id;

    if v_match_id is not null then
      perform private.audit('match_created', 'match', v_match_id, '{}'::jsonb);
      return jsonb_build_object('status', 'liked', 'matched', true, 'match_id', v_match_id);
    end if;

    select m.id into v_match_id from public.matches m
    where m.student_low = least(me, p_target) and m.student_high = greatest(me, p_target);
  end if;

  return jsonb_build_object(
    'status', case when v_inserted = 0 then 'duplicate' else 'liked' end,
    'matched', false,
    'match_id', v_match_id);
end;
$$;

-- Withdraw a one-way like (no open match). Removes it from the shortlist.
create or replace function public.withdraw_like(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_deleted int;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  perform private.lock_students(me, p_target);
  if exists (
    select 1 from public.matches m
    where m.student_low = least(me, p_target) and m.student_high = greatest(me, p_target)
      and m.status in ('mutual', 'pending_confirmation', 'finalised')
  ) then
    raise exception 'MATCH_EXISTS' using errcode = 'P0001';
  end if;
  delete from public.likes where liker_id = me and target_id = p_target;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('status', case when v_deleted = 0 then 'not_found' else 'withdrawn' end);
end;
$$;

-- Return a passed profile to the discovery deck (explicit revisit).
create or replace function public.reconsider_pass(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  delete from public.passes where actor_id = me and target_id = p_target;
  return jsonb_build_object('status', 'reconsidered');
end;
$$;

-- ---------------------------------------------------------------------------
-- Ranked shortlist. Replaces the caller's ordering atomically. Ranking is a
-- preference signal only — it never creates or changes a match.
-- ---------------------------------------------------------------------------
create or replace function public.set_shortlist_order(p_candidates uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n int := coalesce(cardinality(p_candidates), 0);
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if n > 500 then
    raise exception 'TOO_MANY_CANDIDATES' using errcode = 'P0001';
  end if;
  if n <> (select count(distinct c) from unnest(p_candidates) c) or array_position(p_candidates, null) is not null then
    raise exception 'DUPLICATE_CANDIDATE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(p_candidates) c
    where not exists (select 1 from public.likes l where l.liker_id = me and l.target_id = c)
  ) then
    raise exception 'NOT_IN_SHORTLIST' using errcode = 'P0001';
  end if;

  delete from public.shortlist_ranks where user_id = me;
  insert into public.shortlist_ranks (user_id, candidate_id, rank)
  select me, c, ord::smallint
  from unnest(p_candidates) with ordinality as t(c, ord);

  return jsonb_build_object('status', 'saved', 'count', n);
end;
$$;

-- ---------------------------------------------------------------------------
-- Partnership state machine
-- ---------------------------------------------------------------------------

-- Recompute mutual <-> pending_confirmation from outstanding intents.
create or replace function private.refresh_match_status(p_match uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.matches m
  set status = case
    when exists (select 1 from public.partnership_intents i where i.match_id = m.id) then 'pending_confirmation'
    else 'mutual' end
  where m.id = p_match
    and m.status in ('mutual', 'pending_confirmation');
$$;

create or replace function public.confirm_partnership(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_other uuid;
  v_status text;
  v_previous uuid;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  -- Participants never change, so they can be read before locking.
  select m.student_low, m.student_high into v_low, v_high from public.matches m where m.id = p_match;
  if v_low is null or me not in (v_low, v_high) then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_other := case when me = v_low then v_high else v_low end;

  perform private.lock_students(v_low, v_high);
  select m.status into v_status from public.matches m where m.id = p_match for update;

  if v_status not in ('mutual', 'pending_confirmation') then
    raise exception 'MATCH_NOT_OPEN' using errcode = 'P0001';
  end if;
  if private.is_partnered(me) or private.is_partnered(v_other) then
    raise exception 'ALREADY_PARTNERED' using errcode = 'P0001';
  end if;
  if not private.is_active_student(me) or not private.is_active_student(v_other) then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- One outstanding confirmation per student: confirming here withdraws any
  -- confirmation the caller had given elsewhere.
  select i.match_id into v_previous from public.partnership_intents i where i.student_id = me;
  insert into public.partnership_intents (student_id, match_id) values (me, p_match)
  on conflict (student_id) do update set match_id = excluded.match_id, created_at = now();
  if v_previous is not null and v_previous <> p_match then
    perform private.refresh_match_status(v_previous);
  end if;

  if exists (select 1 from public.partnership_intents i where i.student_id = v_other and i.match_id = p_match) then
    -- Both confirmed → finalise. The partnership_members primary key is the
    -- final guard: a second finalisation for either student fails here.
    insert into public.partnership_members (student_id, match_id) values (v_low, p_match), (v_high, p_match);
    update public.matches set status = 'finalised', finalised_at = now() where id = p_match;
    delete from public.partnership_intents where student_id in (v_low, v_high);

    -- Close every other open match involving either partner.
    with closed as (
      update public.matches m
      set status = 'closed', closed_reason = 'partner_finalised_elsewhere', ended_at = now()
      where m.id <> p_match
        and m.status in ('mutual', 'pending_confirmation')
        and (m.student_low in (v_low, v_high) or m.student_high in (v_low, v_high))
      returning m.id
    )
    delete from public.partnership_intents i using closed where i.match_id = closed.id;

    perform private.audit('partnership_finalised', 'match', p_match, '{}'::jsonb);
    return jsonb_build_object('status', 'finalised', 'match_id', p_match);
  end if;

  perform private.refresh_match_status(p_match);
  perform private.audit('partnership_confirmed_by_one', 'match', p_match, '{}'::jsonb);
  return jsonb_build_object('status', 'awaiting_partner', 'match_id', p_match);
end;
$$;

create or replace function public.withdraw_confirmation(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select m.student_low, m.student_high into v_low, v_high from public.matches m where m.id = p_match;
  if v_low is null or me not in (v_low, v_high) then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  perform private.lock_students(v_low, v_high);
  delete from public.partnership_intents where student_id = me and match_id = p_match;
  perform private.refresh_match_status(p_match);
  return jsonb_build_object('status', 'withdrawn');
end;
$$;

-- Decline an open match. Also withdraws the caller's like (and shortlist rank).
create or replace function public.decline_match(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_status text;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select m.student_low, m.student_high into v_low, v_high from public.matches m where m.id = p_match;
  if v_low is null or me not in (v_low, v_high) then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  perform private.lock_students(v_low, v_high);
  select m.status into v_status from public.matches m where m.id = p_match for update;
  if v_status not in ('mutual', 'pending_confirmation') then
    raise exception 'MATCH_NOT_OPEN' using errcode = 'P0001';
  end if;

  update public.matches
  set status = 'declined', closed_reason = 'declined', ended_by = me, ended_at = now()
  where id = p_match;
  delete from public.partnership_intents where match_id = p_match;
  delete from public.likes
  where liker_id = me and target_id = case when me = v_low then v_high else v_low end;
  perform private.audit('match_declined', 'match', p_match, '{}'::jsonb);
  return jsonb_build_object('status', 'declined');
end;
$$;

-- A finalised partnership can only be ended by an administrator. Either
-- partner can ask for that here.
create or replace function public.request_partnership_cancellation(p_match uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_match public.matches;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if private.blank(p_reason) or char_length(p_reason) > 1000 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_match from public.matches m where m.id = p_match for update;
  if v_match.id is null or me not in (v_match.student_low, v_match.student_high) then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_match.status <> 'finalised' then
    raise exception 'MATCH_NOT_FINALISED' using errcode = 'P0001';
  end if;
  update public.matches
  set cancellation_requested_by = me,
      cancellation_reason = btrim(p_reason),
      cancellation_requested_at = now()
  where id = p_match;
  perform private.audit('partnership_cancellation_requested', 'match', p_match, '{}'::jsonb);
  return jsonb_build_object('status', 'requested');
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile photo: one slot per student. The image arrives base64-encoded
-- (already validated by the server route); the primary key on
-- profile_photos.user_id means an upload always replaces the single photo.
-- ---------------------------------------------------------------------------
create or replace function public.upload_profile_photo(p_data_base64 text, p_content_type text, p_confirmed boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_bytes bytea;
  v_now timestamptz := now();
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if private.user_role(me) is distinct from 'student' then
    raise exception 'NOT_A_STUDENT' using errcode = 'P0001';
  end if;
  if p_confirmed is not true then
    raise exception 'PHOTO_CONFIRMATION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'PHOTO_INVALID' using errcode = 'P0001';
  end if;
  v_bytes := decode(p_data_base64, 'base64');
  if octet_length(v_bytes) = 0 or octet_length(v_bytes) > 4194304 then
    raise exception 'PHOTO_INVALID' using errcode = 'P0001';
  end if;

  insert into public.profile_photos (user_id, content_type, data, updated_at)
  values (me, p_content_type, v_bytes, v_now)
  on conflict (user_id) do update
    set content_type = excluded.content_type, data = excluded.data, updated_at = excluded.updated_at;

  update public.profiles
  set photo_path = me::text || '/avatar', photo_confirmed = true, photo_updated_at = v_now
  where id = me;
  return jsonb_build_object('status', 'saved', 'photo_path', me::text || '/avatar', 'photo_updated_at', v_now);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create or replace function public.submit_report(p_reported uuid, p_category text, p_explanation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_existing uuid;
  v_id uuid;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_reported is null or p_reported = me then
    raise exception 'SELF_ACTION' using errcode = 'P0001';
  end if;
  if private.user_role(me) is distinct from 'student' or private.user_role(p_reported) is distinct from 'student' then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if p_category not in ('inaccurate_profile', 'photo_not_of_person', 'inappropriate_content', 'harassment', 'spam', 'other') then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_explanation, '')) > 1000 then
    raise exception 'EXPLANATION_TOO_LONG' using errcode = 'P0001';
  end if;
  if (select count(*) from public.reports r where r.reporter_id = me and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  select r.id into v_existing from public.reports r
  where r.reporter_id = me and r.reported_id = p_reported and r.status in ('open', 'in_review')
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('status', 'already_reported', 'report_id', v_existing);
  end if;

  insert into public.reports (reporter_id, reported_id, category, explanation)
  values (me, p_reported, p_category, nullif(btrim(coalesce(p_explanation, '')), ''))
  returning id into v_id;
  insert into public.report_events (report_id, actor_id, action) values (v_id, me, 'submitted');
  return jsonb_build_object('status', 'submitted', 'report_id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Account removal request. Hides the profile immediately; an administrator
-- completes deletion (see docs/ARCHITECTURE.md "Data retention").
-- ---------------------------------------------------------------------------
create or replace function public.request_account_deletion(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if private.user_role(me) is distinct from 'student' then
    raise exception 'NOT_A_STUDENT' using errcode = 'P0001';
  end if;
  insert into public.account_deletion_requests (user_id, reason)
  values (me, nullif(btrim(coalesce(left(p_reason, 500), '')), ''))
  on conflict (user_id) do nothing;
  update public.profiles set status = 'draft' where id = me;
  delete from public.partnership_intents where student_id = me;
  perform private.audit('account_deletion_requested', 'user', me, '{}'::jsonb);
  return jsonb_build_object('status', 'requested');
end;
$$;

-- ---------------------------------------------------------------------------
-- AI: per-user rate limit and cached pair insights
-- ---------------------------------------------------------------------------
create or replace function public.consume_ai_quota(p_feature text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_limit int;
  v_used int;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_limit := case p_feature when 'profile_coach' then 30 when 'pair_insight' then 40 else null end;
  if v_limit is null then
    raise exception 'INVALID_FEATURE' using errcode = 'P0001';
  end if;
  perform private.lock_students(me);
  select count(*) into v_used from public.ai_usage u
  where u.user_id = me and u.feature = p_feature and u.created_at > now() - interval '1 hour';
  if v_used >= v_limit then
    return false;
  end if;
  insert into public.ai_usage (user_id, feature) values (me, p_feature);
  return true;
end;
$$;

-- Students can only cache insights for their own view; a forged row could
-- only ever be shown back to the caller.
create or replace function public.store_ai_insight(
  p_subject uuid, p_input_version text, p_model text, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  insert into public.ai_insights (feature, viewer_id, subject_id, input_version, model, result)
  values ('pair_insight', me, p_subject, p_input_version, p_model, p_result)
  on conflict (feature, viewer_id, subject_id, input_version)
  do update set result = excluded.result, model = excluded.model, created_at = now(),
                expires_at = now() + interval '30 days';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only authenticated users may call these.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.my_status(), public.discovery_candidates(), public.record_decision(uuid, text),
  public.withdraw_like(uuid), public.reconsider_pass(uuid), public.set_shortlist_order(uuid[]),
  public.confirm_partnership(uuid), public.withdraw_confirmation(uuid), public.decline_match(uuid),
  public.request_partnership_cancellation(uuid, text), public.upload_profile_photo(text, text, boolean),
  public.submit_report(uuid, text, text), public.request_account_deletion(text),
  public.consume_ai_quota(text), public.store_ai_insight(uuid, text, text, jsonb)
from public, anon;

grant execute on function
  public.my_status(), public.discovery_candidates(), public.record_decision(uuid, text),
  public.withdraw_like(uuid), public.reconsider_pass(uuid), public.set_shortlist_order(uuid[]),
  public.confirm_partnership(uuid), public.withdraw_confirmation(uuid), public.decline_match(uuid),
  public.request_partnership_cancellation(uuid, text), public.upload_profile_photo(text, text, boolean),
  public.submit_report(uuid, text, text), public.request_account_deletion(text),
  public.consume_ai_quota(text), public.store_ai_insight(uuid, text, text, jsonb)
to authenticated;
