-- BSL Connect — problem statement preferences
--
-- Every student ranks three company problem statements (1 = top priority).
-- The catalogue comes from the programme's "List of Problem Statements"
-- sheet and is mirrored in src/lib/profile/problem-statements.ts; tests keep
-- the two in agreement.
--
-- - profiles.problem_statements holds catalogue ids in priority order.
-- - Publication requires all three. Profiles published before this migration
--   stay published; the app asks those students to choose before anything
--   else, and their next profile edit must include the picks.
-- - After the deadline (31 October 2026, end of day IST) a completed ranking
--   is locked. Students who have not chosen yet can still choose once.
-- - Onboarding gains a step 7 for the picks: photo moves to 8, review to 9.

create table public.problem_statements (
  id text primary key check (id ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (char_length(name) <= 80),
  company text not null check (char_length(company) <= 80),
  sector text not null check (char_length(sector) <= 80),
  focus text not null check (char_length(focus) <= 80),
  pdf_url text not null check (pdf_url ~ '^https://'),
  sort_order smallint not null unique
);

alter table public.problem_statements enable row level security;
grant select on public.problem_statements to authenticated;
create policy problem_statements_select on public.problem_statements
  for select to authenticated using (true);

insert into public.problem_statements (id, name, company, sector, focus, pdf_url, sort_order) values
  ('pocketfm', 'PocketFM', 'PocketFM', 'Media & Entertainment', 'Market Research & GTM', 'https://drive.google.com/file/d/1VZTA1XNUqmS7kmDHV3ZK5O869JOcQx-F/view?usp=drive_link', 1),
  ('technosport-1', 'Technosport 1', 'Technosport', 'Consumer Brand', 'Operations & Planning', 'https://drive.google.com/file/d/1_lmU8NdkWN4A9SROFRWmhoYKkhZFK-qG/view?usp=drive_link', 2),
  ('technosport-2', 'Technosport 2', 'Technosport', 'Consumer Brand', 'Market & Category Expansion', 'https://drive.google.com/file/d/1ah6gPkFtnyevgi93S6NE6rUyCuIzmnxV/view?usp=drive_link', 3),
  ('sortment', 'Sortment', 'Sortment', 'AI', 'Market Research & GTM', 'https://drive.google.com/file/d/1erBoDvVdCyakiU1N9y74Qg767o5XYZ1l/view?usp=drive_link', 4),
  ('modveon', 'Modveon', 'Modveon', 'Fintech', 'Product Strategy & Prototype', 'https://drive.google.com/file/d/1wU7PmBHK1eN9-ShHQVwE7nLKO8_5eMbg/view?usp=drive_link', 5),
  ('bounce-1', 'Bounce 1', 'Bounce', 'Mobility & EV', 'Operations & Planning', 'https://drive.google.com/file/d/1zTKemVG9Wh2ikFYanhJJFFQtVElCpQic/view?usp=drive_link', 6),
  ('bounce-2', 'Bounce 2', 'Bounce', 'Mobility & EV', 'Market & Category Expansion', 'https://drive.google.com/file/d/1RgvesIWaIHfdtvtqkSgMf-7tWMa6byCd/view?usp=drive_link', 7),
  ('ringgai', 'RinggAI', 'RinggAI', 'AI', 'Product Strategy & Prototype', 'https://drive.google.com/file/d/1OoBI6wiQex40pCXIO4CHlEM5qC5qhC1g/view?usp=drive_link', 8),
  ('keemakr', 'KeeMakr', 'KeeMakr', 'HealthTech', 'Market Research & GTM', 'https://drive.google.com/file/d/1gN8xgzQZZRNNCE1ebmTuMIF_JI9_NN46/view?usp=drive_link', 9),
  ('vobiz-ai', 'Vobiz AI', 'Vobiz AI', 'AI', 'Market & Category Expansion', 'https://drive.google.com/file/d/1sbl-FZ0jwBvzkidKPzny-geM_1sW8Jko/view?usp=drive_link', 10),
  ('powerup-money', 'PowerUp Money', 'PowerUp Money', 'Fintech', 'Market Research & GTM', 'https://drive.google.com/file/d/1ag-TdDeJ1EWv1UuiYyTVmgdgwS4c5mxj/view?usp=drive_link', 11),
  ('kuku-1', 'Kuku 1', 'Kuku', 'Media & Entertainment', 'Market Research & GTM', 'https://drive.google.com/file/d/1oi_YhjzX1SvvebFMJpHIhXiZdaJBGy8I/view?usp=drive_link', 12),
  ('kuku-2', 'Kuku 2', 'Kuku', 'Media & Entertainment', 'Market & Category Expansion', 'https://drive.google.com/file/d/1mZLEiGg4AzsiUJxAP-WAbtIi5Zo-9XTL/view?usp=drive_link', 13),
  ('even', 'Even', 'Even', 'HealthTech', 'New Segments & Channels', 'https://drive.google.com/file/d/1QWIGJIH-cYa9h7Cnc3kvcc9AHrdnL3eG/view?usp=drive_link', 14),
  ('superliving-1', 'Superliving 1', 'Superliving', 'HealthTech', 'Product Strategy & Prototype', 'https://drive.google.com/file/d/1-rxeClhFxDsWzmxEMrDTyFF-nyz65nfz/view?usp=drive_link', 15),
  ('superliving-2', 'Superliving 2', 'Superliving', 'HealthTech', 'Customer Growth & Retention', 'https://drive.google.com/file/d/1t9pULAplkbu2iXJaih0ZWx5hZzifAg14/view?usp=drive_link', 16),
  ('sirona', 'Sirona', 'Sirona', 'Consumer Brand', 'Market Research & GTM', 'https://drive.google.com/file/d/1ihWYoWo2JiKEhfcHlLYlN25_kvj9xtWx/view?usp=drive_link', 17),
  ('altm', 'AltM', 'AltM', 'CleanTech and Renewable Energy', 'Market Research & GTM', 'https://drive.google.com/file/d/10RHiVCy4HLhUYEc_8jv8LXLlziimPAnE/view?usp=drive_link', 18),
  ('scispace', 'SciSpace', 'SciSpace', 'AI', 'Market Research & GTM', 'https://drive.google.com/file/d/1-Xiy17eXUN4qa_GYzb5Rk2ey8NP9b7oK/view?usp=drive_link', 19),
  ('allhome', 'AllHome', 'AllHome', 'Real Estate/Home', 'Customer Growth & Retention', 'https://drive.google.com/file/d/18EJPbpJWz5eIOUkWHMrcVPJH41vPj_eG/view?usp=drive_link', 20),
  ('dashverse', 'Dashverse', 'Dashverse', 'Media & Entertainment', 'New Segments & Channels', 'https://drive.google.com/file/d/1joca60dwpDjbLs_75Z3r24Z4qEXqPZPQ/view?usp=drive_link', 21),
  ('shopos-1', 'ShopOS 1', 'ShopOS', 'AI', 'Customer Growth & Retention', 'https://drive.google.com/file/d/1d70Mluv49BGH8R90-sAvjdyorZq6bRW_/view?usp=drive_link', 22),
  ('shopos-2', 'ShopOS 2', 'ShopOS', 'AI', 'Market Research & GTM', 'https://drive.google.com/file/d/1tGttdrjRkedmXQ2U-jT-qMg_04oj1k3n/view?usp=drive_link', 23),
  ('tata-1mg-1', 'Tata 1mg 1', 'Tata 1mg', 'HealthTech', 'Operations & Planning', 'https://drive.google.com/file/d/1kfvl2WCAj7ED-Unbqz5WN7GWsiNcppNq/view?usp=drive_link', 24),
  ('tata-1mg-2', 'Tata 1mg 2', 'Tata 1mg', 'HealthTech', 'Operations & Planning', 'https://drive.google.com/file/d/1W4MNscUDWqfT7PjIRuNK5dkKpRCUmkdy/view?usp=drive_link', 25),
  ('salaryse', 'SalarySe', 'SalarySe', 'Fintech', 'Product Strategy & Prototype', 'https://drive.google.com/file/d/1yLAjVUfYEx3-5GYvYqxlsV-PxgKW3-gF/view?usp=drive_link', 26),
  ('rio-health', 'Rio Health', 'Rio Health', 'HealthTech', 'Customer Growth & Retention', 'https://drive.google.com/file/d/11lfC0gwLXEfXtYNs8CGsgsDV7L-6wXa8/view?usp=drive_link', 27),
  ('comet-1', 'Comet 1', 'Comet', 'Consumer Brand', 'Customer Growth & Retention', 'https://drive.google.com/file/d/1GsjV9q3rE8r60YeF50mO7NQWrYJL9lkW/view?usp=drive_link', 28),
  ('comet-2', 'Comet 2', 'Comet', 'Consumer Brand', 'Market & Category Expansion', 'https://drive.google.com/file/d/1_fzgUoGGNSPpYJsiQoAV0Rb9QcHcDMS9/view?usp=drive_link', 29),
  ('the-medical-travel-company', 'The Medical Travel Company', 'The Medical Travel Company', 'HealthTech', 'New Segments & Channels', 'https://drive.google.com/file/d/1iplcCMajHTmMiinqE8xaTB6b9JH5qi4V/view?usp=drive_link', 30),
  ('toddle', 'Toddle', 'Toddle', 'EdTech', 'Marketing & Content', 'https://drive.google.com/file/d/1f8l4ut8VD_UmyPL7Hf05uD_kI4n0X8Nf/view?usp=drive_link', 31),
  ('padcare-labs', 'PadCare Labs', 'PadCare Labs', 'CleanTech and Renewable Energy', 'Market Research & GTM', 'https://drive.google.com/file/d/1-nDiVzn5cGvacnl-MQiUelDCykkD0qPD/view?usp=drive_link', 32),
  ('eleven-labs', 'Eleven Labs', 'Eleven Labs', 'AI', 'Market Research & GTM', 'https://drive.google.com/file/d/1yVwG_5bCBU9dQvIzAQNsTKR0clMHE_jH/view?usp=drive_link', 33),
  ('peakxv', 'PeakXV', 'PeakXV', 'Venture Capital', 'Market Research & GTM', 'https://drive.google.com/file/d/1annddagC-zTGcWrqSXrMU5Hlb_KxAQSk/view?usp=drive_link', 34),
  ('reo-dev', 'Reo.Dev', 'Reo.Dev', 'AI', 'Customer Growth & Retention', 'https://drive.google.com/file/d/1-5iPRiHqA6sXR4DD-MXWDtmNihV-mcEX/view?usp=drive_link', 35),
  ('holiday-tribe-1', 'Holiday Tribe 1', 'Holiday Tribe', 'Travel', 'Customer Growth & Retention', 'https://drive.google.com/file/d/1dHlvVjPf52sRj6RmomuIqhTy8ZIdbfSo/view?usp=drive_link', 36),
  ('holiday-tribe-2', 'Holiday Tribe 2', 'Holiday Tribe', 'Travel', 'Product Strategy & Prototype', 'https://drive.google.com/file/d/1QhEF4ghX7u5cWeoaGVJqgd7Lyy4AWI45/view?usp=drive_link', 37),
  ('korrai', 'KorrAI', 'KorrAI', 'AI', 'Market & Category Expansion', 'https://drive.google.com/file/d/1HE33pzbt3tYUwJ4eLSgbbjYVwWYBS_D_/view?usp=drive_link', 38),
  ('circle', 'Circle', 'Circle', 'E-commerce', 'Marketing & Content', 'https://drive.google.com/file/d/1zsd7xeDG7bBYLgZdRKDnHBf8AbVbgTLr/view?usp=drive_link', 39),
  ('zylabs-ai', 'Zylabs AI', 'Zylabs AI', 'AI', 'Product Strategy & Prototype', 'https://drive.google.com/file/d/11pi8lauNdf43SMYqNhyn5nXCztXcHo3K/view?usp=drive_link', 40),
  ('sauce-1', 'Sauce 1', 'Sauce', 'Venture Capital', 'Market Research & GTM', 'https://drive.google.com/file/d/19u-hlRV9D2pfjpXG4JxAg4czCWeI5M56/view?usp=drive_link', 41),
  ('sauce-2', 'Sauce 2', 'Sauce', 'Venture Capital', 'Market Research & GTM', 'https://drive.google.com/file/d/1u5sPdGEQ1GxssMc2286Ybh9yXnTFp37f/view?usp=drive_link', 42),
  ('square-yards-1', 'Square Yards 1', 'Square Yards', 'Real Estate/Home', 'Product Strategy & Prototype', 'https://drive.google.com/file/d/1ygOJYECBqb-6tM9X1oglVQsnbj6uhNP0/view?usp=drive_link', 43),
  ('square-yards-2', 'Square Yards 2', 'Square Yards', 'Real Estate/Home', 'Market & Category Expansion', 'https://drive.google.com/file/d/1PgbRDFn-vkzzQSOnLQ1DN5KiA12wmYzS/view?usp=drive_link', 44),
  ('apna', 'Apna', 'Apna', 'HR Tech', 'Market Research & GTM', 'https://drive.google.com/file/d/1OQ7Lg_Cv5aj6F8VP6WfGAvhorqBeOFRs/view?usp=drive_link', 45);

-- Replace this function to move the deadline.
create or replace function private.problem_statement_deadline()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select timestamptz '2026-11-01 00:00:00+05:30';
$$;

alter table public.profiles
  add column problem_statements text[] not null default '{}'
  check (cardinality(problem_statements) <= 3);

-- Picks must be distinct catalogue ids; a full ranking is locked after the deadline.
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
     and cardinality(old.problem_statements) = 3
     and now() >= private.problem_statement_deadline() then
    raise exception 'PROBLEM_STATEMENTS_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger bsl_profiles_problem_statements
  before insert or update of problem_statements on public.profiles
  for each row execute function private.profiles_problem_statements_guard();

grant update (problem_statements) on public.profiles to authenticated;

-- Renumber onboarding before completeness changes (the profile trigger
-- re-checks completeness on every update of a published row). Drafts that
-- had reached the photo or review step land on the new step.
alter table public.profiles drop constraint profiles_onboarding_step_check;
alter table public.profiles add constraint profiles_onboarding_step_check check (onboarding_step between 1 and 9);
update public.profiles set onboarding_step = 7 where status = 'draft' and onboarding_step >= 7;
update public.profiles set onboarding_step = onboarding_step + 1 where status = 'published' and onboarding_step >= 7;

-- Completeness now asks for three ranked problem statements.
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
  if coalesce(cardinality(p.problem_statements), 0) < 3 then missing := array_append(missing, 'problem_statements'); end if;
  if p.photo_path is null then missing := array_append(missing, 'photo'); end if;
  if not p.photo_confirmed then missing := array_append(missing, 'photo_confirmed'); end if;
  if not p.details_confirmed then missing := array_append(missing, 'details_confirmed'); end if;
  if not p.visibility_acknowledged then missing := array_append(missing, 'visibility_acknowledged'); end if;
  return missing;
end;
$$;

-- Photo removal sends the student back to the photo step, now step 8.
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
  set photo_path = null, photo_confirmed = false, photo_updated_at = now(), status = 'draft', onboarding_step = 8
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

-- The export lists each student's ranked picks. The return type changes, so recreate it.
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
