-- BSL Connect — multiple career objectives
--
-- Students can be working towards several outcomes, and can add their own.
-- `career_objectives` holds preset option keys (e.g. 'consulting') and
-- free-text entries side by side. It replaces career_objective and
-- career_objective_detail; existing values are carried over.

alter table public.profiles
  add column career_objectives text[] not null default '{}'
  check (private.text_array_ok(career_objectives, 6, 80));

update public.profiles
set career_objectives = array(
  select distinct on (lower(v)) v
  from unnest(array[
    nullif(btrim(career_objective), ''),
    left(nullif(btrim(career_objective_detail), ''), 80)
  ]) as t(v)
  where v is not null
);

-- Completeness now asks for at least one objective.
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
  if coalesce(cardinality(p.career_objectives), 0) = 0 then missing := array_append(missing, 'career_objectives'); end if;
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

-- The export lists all objectives. The return type changes, so recreate it.
drop function public.admin_export_rows();
create function public.admin_export_rows()
returns table (
  full_name text,
  email text,
  cohort text,
  role_title text,
  profile_status text,
  career_objectives text,
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
    select p.full_name, u.email::text, p.cohort, p.role_title, p.status,
           array_to_string(p.career_objectives, '; '),
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
revoke execute on function public.admin_export_rows() from public, anon;
grant execute on function public.admin_export_rows() to authenticated;

alter table public.profiles drop column career_objective, drop column career_objective_detail;
grant update (career_objectives) on public.profiles to authenticated;
