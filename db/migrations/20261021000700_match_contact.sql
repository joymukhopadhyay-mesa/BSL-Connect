-- BSL Connect — contact details for mutual matches
-- Emails are never part of profile rows. Once two students have both opted in
-- (a mutual match that is open or finalised), each may see the other's MESA
-- email so they can talk before confirming.

create or replace function public.match_contact(p_match uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_match public.matches;
  v_other uuid;
  v_email text;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select * into v_match from public.matches m where m.id = p_match;
  if v_match.id is null or me not in (v_match.student_low, v_match.student_high) then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_match.status not in ('mutual', 'pending_confirmation', 'finalised') then
    return jsonb_build_object('email', null);
  end if;
  v_other := case when me = v_match.student_low then v_match.student_high else v_match.student_low end;
  if private.is_suspended(v_other) then
    return jsonb_build_object('email', null);
  end if;
  select u.email into v_email from auth.users u where u.id = v_other;
  return jsonb_build_object('email', v_email);
end;
$$;

revoke execute on function public.match_contact(uuid) from public, anon;
grant execute on function public.match_contact(uuid) to authenticated;
