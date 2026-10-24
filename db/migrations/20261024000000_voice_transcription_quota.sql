-- Voice dictation: a third AI feature with its own hourly quota.
-- Audio is never stored; only the usage row (user, feature, time) is kept.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage
  add constraint ai_usage_feature_check
  check (feature in ('profile_coach', 'pair_insight', 'voice_transcription'));

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
  v_limit := case p_feature
    when 'profile_coach' then 30
    when 'pair_insight' then 40
    when 'voice_transcription' then 40
    else null
  end;
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
