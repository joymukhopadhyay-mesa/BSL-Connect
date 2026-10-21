-- BSL Connect — core schema
-- Tables, constraints and indexes. Authorisation lives in later migrations
-- (helpers/triggers, RLS policies, RPCs).

create schema if not exists private;
comment on schema private is
  'Internal helpers used by RLS policies and RPCs. Never callable by API roles except where granted.';

-- ---------------------------------------------------------------------------
-- Validation helpers used by CHECK constraints (must be immutable).
-- ---------------------------------------------------------------------------

-- Exact, case-insensitive domain match. Rejects look-alikes such as
-- "x@pg27.mesaschool.co.evil.com", "x@evilpg27.mesaschool.co" and
-- sub-domains such as "x@a.pg27.mesaschool.co".
create or replace function private.is_allowed_student_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null
     and lower(btrim(p_email)) ~ '^[^@[:space:]]+@pg27\.mesaschool\.co$';
$$;

create or replace function private.text_array_ok(p_arr text[], p_max_items int, p_max_len int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_arr is not null
     and coalesce(cardinality(p_arr), 0) <= p_max_items
     and coalesce((select bool_and(char_length(btrim(x)) between 1 and p_max_len) from unnest(p_arr) as x), true);
$$;

-- ---------------------------------------------------------------------------
-- Roles and staff provisioning
-- ---------------------------------------------------------------------------

-- Staff (programme coordinators / faculty) may use a non-student email domain.
-- Rows are only ever written by the database owner (SQL editor, migration or
-- scripts/provision-admin.mjs), never by an API role.
create table public.staff_allowlist (
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  role text not null default 'admin' check (role = 'admin'),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (one per student; created automatically on sign-up)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- Step 1: basics
  full_name text check (char_length(full_name) <= 120),
  cohort text check (char_length(cohort) <= 60),
  role_title text check (char_length(role_title) <= 120),
  background text check (char_length(background) <= 700),
  years_experience numeric(3, 1) check (years_experience between 0 and 50),
  career_objective text check (char_length(career_objective) <= 60),
  career_objective_detail text check (char_length(career_objective_detail) <= 300),
  intro text check (char_length(intro) <= 700),

  -- Step 2: strengths
  strengths text[] not null default '{}' check (private.text_array_ok(strengths, 12, 48)),
  strengths_good_at text check (char_length(strengths_good_at) <= 700),
  strengths_problems text check (char_length(strengths_problems) <= 700),
  strengths_example text check (char_length(strengths_example) <= 900),

  -- Step 3: development areas
  development_areas text[] not null default '{}' check (private.text_array_ok(development_areas, 10, 48)),
  development_current text check (char_length(development_current) <= 700),
  development_complement text check (char_length(development_complement) <= 700),
  development_help text check (char_length(development_help) <= 700),

  -- Step 4: industries. Experience and interest are deliberately separate.
  industries_experience text[] not null default '{}' check (private.text_array_ok(industries_experience, 15, 60)),
  industries_experience_detail text check (char_length(industries_experience_detail) <= 700),
  industries_interest text[] not null default '{}' check (private.text_array_ok(industries_interest, 15, 60)),

  -- Step 5: working-style questionnaire (validated by the app; structure checked here)
  questionnaire jsonb not null default '{}'::jsonb
    check (jsonb_typeof(questionnaire) = 'object' and pg_column_size(questionnaire) <= 12000),

  -- Step 6: partner preferences
  partner_skills text[] not null default '{}' check (private.text_array_ok(partner_skills, 10, 48)),
  partner_industries text[] not null default '{}' check (private.text_array_ok(partner_industries, 15, 60)),
  partner_qualities text[] not null default '{}' check (private.text_array_ok(partner_qualities, 8, 48)),
  partner_success text check (char_length(partner_success) <= 700),

  -- Step 7: exactly one photo slot. photo_path marks that the single photo
  -- row in public.profile_photos exists; it can only ever be "<id>/avatar".
  photo_path text check (photo_path is null or photo_path = id::text || '/avatar'),
  photo_confirmed boolean not null default false,
  photo_updated_at timestamptz,

  -- Step 8: publication confirmations
  details_confirmed boolean not null default false,
  visibility_acknowledged boolean not null default false,

  onboarding_step smallint not null default 1 check (onboarding_step between 1 and 8),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_status_idx on public.profiles (status);

-- The single profile photo per student (primary key = one slot). Replacing a
-- photo overwrites this row. Access mirrors profile visibility (see RLS).
create table public.profile_photos (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data bytea not null check (octet_length(data) between 1 and 4194304),
  updated_at timestamptz not null default now()
);

-- Moderation state is admin-only and kept off the profile row so that
-- students can never read it.
create table public.moderation_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  suspended boolean not null default false,
  reason text check (char_length(reason) <= 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Discovery decisions. Likes are private to the liker.
-- ---------------------------------------------------------------------------

create table public.likes (
  liker_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (liker_id, target_id),
  constraint likes_no_self check (liker_id <> target_id)
);
create index likes_target_idx on public.likes (target_id);

create table public.passes (
  actor_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (actor_id, target_id),
  constraint passes_no_self check (actor_id <> target_id)
);

-- Ranked shortlist. Every ranked candidate must be someone the user liked
-- (composite FK), ranks are unique per user. Ranking never creates a match.
create table public.shortlist_ranks (
  user_id uuid not null,
  candidate_id uuid not null,
  rank smallint not null check (rank between 1 and 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, candidate_id),
  constraint shortlist_rank_unique unique (user_id, rank) deferrable initially deferred,
  constraint shortlist_requires_like foreign key (user_id, candidate_id)
    references public.likes (liker_id, target_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Matches and partnerships
--
-- State machine (see docs/ARCHITECTURE.md):
--   (no row)              discovery / one-way like
--   mutual                both students liked each other
--   pending_confirmation  at least one participant has confirmed
--   finalised             both confirmed — the BSL partnership
--   declined              a participant declined before finalisation
--   closed                a participant finalised a different partnership
--   cancelled             a finalised partnership cancelled by an administrator
-- ---------------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  -- Unordered pair stored in canonical order so one pair = one row.
  student_low uuid not null references public.profiles (id) on delete cascade,
  student_high uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'mutual'
    check (status in ('mutual', 'pending_confirmation', 'finalised', 'declined', 'closed', 'cancelled')),
  finalised_at timestamptz,
  closed_reason text check (closed_reason in ('declined', 'partner_finalised_elsewhere', 'cancelled_by_admin')),
  ended_by uuid references auth.users (id) on delete set null,
  ended_at timestamptz,
  cancellation_requested_by uuid references auth.users (id) on delete set null,
  cancellation_reason text check (char_length(cancellation_reason) <= 1000),
  cancellation_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_canonical_pair check (student_low < student_high),
  constraint matches_pair_unique unique (student_low, student_high),
  constraint matches_finalised_has_time check (status <> 'finalised' or finalised_at is not null)
);
create index matches_low_idx on public.matches (student_low, status);
create index matches_high_idx on public.matches (student_high, status);

-- A student can have at most ONE outstanding confirmation (primary key).
create table public.partnership_intents (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index partnership_intents_match_idx on public.partnership_intents (match_id);

-- A student can belong to at most ONE finalised partnership (primary key).
-- This is the database-level guarantee behind "one confirmed BSL partner".
create table public.partnership_members (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index partnership_members_match_idx on public.partnership_members (match_id);

-- ---------------------------------------------------------------------------
-- Reports and moderation history
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in (
    'inaccurate_profile', 'photo_not_of_person', 'inappropriate_content', 'harassment', 'spam', 'other')),
  explanation text check (char_length(explanation) <= 1000),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  resolution_note text check (char_length(resolution_note) <= 1000),
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_no_self check (reporter_id is null or reporter_id <> reported_id)
);
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_reported_idx on public.reports (reported_id);

create table public.report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) <= 60),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index report_events_report_idx on public.report_events (report_id, created_at);

-- Append-only audit trail of privileged and state-changing actions.
-- No foreign keys: entries must survive account deletion.
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  subject_type text not null,
  subject_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_subject_idx on public.audit_log (subject_id, created_at desc);

create table public.account_deletion_requests (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- AI support tables
-- ---------------------------------------------------------------------------

-- Rate limiting for AI calls (shared across server instances).
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('profile_coach', 'pair_insight')),
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage (user_id, feature, created_at desc);

-- Cached AI pair insights, keyed by both profiles' versions so an edit to
-- either profile invalidates the cache. Only the structured result is stored —
-- no prompts and no raw profile text.
create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  feature text not null check (feature = 'pair_insight'),
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.profiles (id) on delete cascade,
  input_version text not null check (char_length(input_version) <= 120),
  model text check (char_length(model) <= 120),
  result jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 16000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint ai_insights_unique unique (feature, viewer_id, subject_id, input_version)
);
