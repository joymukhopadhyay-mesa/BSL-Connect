-- BSL Connect — problem statements, round 2
--
-- - Three statements added to the programme sheet (Emergent, Gain, GoStops).
-- - Students may rank up to five: three required, two optional to widen
--   discovery. Publication still needs three.
-- - The deadline moves to 1 November 2026, 10:00 IST. Once it passes, a
--   ranking of three or more is locked; anyone with fewer can still choose.
-- - The cohort export lists all five priorities.

insert into public.problem_statements (id, name, company, sector, focus, pdf_url, sort_order) values
  ('emergent', 'Emergent', 'Emergent', 'AI', 'New Segments & Channels', 'https://drive.google.com/file/d/19aqr5sNCW12mw0TLgnXHV177IMDOC75c/view?usp=drive_link', 46),
  ('gain', 'Gain', 'Gain', 'Fintech', 'Customer Growth & Retention', 'https://drive.google.com/file/d/1RVcXgfH1yXX5JzqdBYIJI7y-QGaRXl_v/view?usp=drive_link', 47),
  ('gostops', 'GoStops', 'GoStops', 'Travel', 'Market Research & GTM', 'https://drive.google.com/file/d/1OFU1w2h-L0OInh6fuYdYr7KaSGRjQvQW/view?usp=drive_link', 48);

alter table public.profiles drop constraint profiles_problem_statements_check;
alter table public.profiles add constraint profiles_problem_statements_check check (cardinality(problem_statements) <= 5);

create or replace function private.problem_statement_deadline()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select timestamptz '2026-11-01 10:00:00+05:30';
$$;

create or replace function private.profiles_problem_statements_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.problem_statements is not distinct from old.problem_statements then
    return new;
  end if;
  if (select count(distinct x) from unnest(new.problem_statements) as x) <> cardinality(new.problem_statements)
     or exists (
       select 1 from unnest(new.problem_statements) as x
       where not exists (select 1 from public.problem_statements s where s.id = x)
     ) then
    raise exception 'INVALID_PROBLEM_STATEMENT' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE'
     and cardinality(old.problem_statements) >= 3
     and now() >= private.problem_statement_deadline() then
    raise exception 'PROBLEM_STATEMENTS_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop function public.admin_export_rows();
create function public.admin_export_rows()
returns table (
  full_name text,
  email text,
  cohort text,
  role_title text,
  profile_status text,
  career_objectives text,
  problem_statement_1 text,
  problem_statement_2 text,
  problem_statement_3 text,
  problem_statement_4 text,
  problem_statement_5 text,
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
           (select s.name from public.problem_statements s where s.id = p.problem_statements[1]),
           (select s.name from public.problem_statements s where s.id = p.problem_statements[2]),
           (select s.name from public.problem_statements s where s.id = p.problem_statements[3]),
           (select s.name from public.problem_statements s where s.id = p.problem_statements[4]),
           (select s.name from public.problem_statements s where s.id = p.problem_statements[5]),
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
