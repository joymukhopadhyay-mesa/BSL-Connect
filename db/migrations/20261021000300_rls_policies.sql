-- BSL Connect — Row Level Security and privileges
--
-- Principles
--  * anon has no access to application data at all.
--  * authenticated gets the narrowest table privileges the app needs; every
--    state change that spans rows goes through an RPC (SECURITY DEFINER,
--    validated against auth.uid()).
--  * RLS is enabled on every table, including ones with no policies (those
--    are reachable only through RPCs or by the database owner).

do $$
declare t text;
begin
  foreach t in array array[
    'staff_allowlist', 'user_roles', 'profiles', 'profile_photos', 'moderation_state', 'likes', 'passes',
    'shortlist_ranks', 'matches', 'partnership_intents', 'partnership_members',
    'reports', 'report_events', 'audit_log', 'account_deletion_requests',
    'ai_usage', 'ai_insights'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end;
$$;

-- Helpers used inside policies must be executable by `authenticated`;
-- everything else in `private` is owner-only.
revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public;
grant execute on function
  private.is_allowed_student_email(text),
  private.text_array_ok(text[], int, int),
  private.user_role(uuid),
  private.is_admin(),
  private.is_suspended(uuid),
  private.is_partnered(uuid),
  private.is_active_student(uuid),
  private.can_browse(),
  private.shares_match_with(uuid),
  private.blank(text),
  private.profile_missing_fields(public.profiles)
to authenticated;

-- ---------------------------------------------------------------------------
-- user_roles: users can read their own role; nobody can write via the API.
-- ---------------------------------------------------------------------------
grant select on public.user_roles to authenticated;
create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or private.is_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;

-- Column-level update grant: id, photo_path, photo_updated_at, version,
-- published_at and timestamps can never be written directly by a user.
grant update (
  full_name, cohort, role_title, background, years_experience, career_objective,
  career_objective_detail, intro, strengths, strengths_good_at, strengths_problems,
  strengths_example, development_areas, development_current, development_complement,
  development_help, industries_experience, industries_experience_detail,
  industries_interest, questionnaire, partner_skills, partner_industries,
  partner_qualities, partner_success, photo_confirmed, details_confirmed,
  visibility_acknowledged, onboarding_step, status
) on public.profiles to authenticated;

-- Visible to: the owner; admins; and active students browsing the cohort
-- (published + not suspended). Matched participants can always see each other
-- while both remain non-suspended.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or private.is_admin()
    or (
      status = 'published'
      and not private.is_suspended(id)
      and private.user_role(id) = 'student'
      and (private.can_browse() or private.shares_match_with(id))
    )
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() and private.user_role(auth.uid()) = 'student')
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- profile_photos: readable exactly when the caller can read the profile that
-- owns it (the subquery runs under the caller's RLS). Written only via RPC.
-- ---------------------------------------------------------------------------
grant select on public.profile_photos to authenticated;
create policy profile_photos_select on public.profile_photos
  for select to authenticated
  using (
    user_id = auth.uid()
    or private.is_admin()
    or exists (select 1 from public.profiles p where p.id = profile_photos.user_id and p.photo_path is not null)
  );

-- ---------------------------------------------------------------------------
-- moderation_state, audit_log, staff_allowlist, deletion requests: admin read
-- ---------------------------------------------------------------------------
grant select on public.moderation_state to authenticated;
create policy moderation_admin_select on public.moderation_state
  for select to authenticated using (private.is_admin());

grant select on public.audit_log to authenticated;
create policy audit_admin_select on public.audit_log
  for select to authenticated using (private.is_admin());

grant select on public.account_deletion_requests to authenticated;
create policy deletion_select on public.account_deletion_requests
  for select to authenticated using (user_id = auth.uid() or private.is_admin());

-- staff_allowlist: no policies → not readable by API roles.

-- ---------------------------------------------------------------------------
-- likes / passes / shortlist: strictly private to their owner.
-- Admins see aggregates only (via admin RPCs), never the rows.
-- Writes go through RPCs.
-- ---------------------------------------------------------------------------
grant select on public.likes to authenticated;
create policy likes_select_own on public.likes
  for select to authenticated using (liker_id = auth.uid());

grant select on public.passes to authenticated;
create policy passes_select_own on public.passes
  for select to authenticated using (actor_id = auth.uid());

grant select on public.shortlist_ranks to authenticated;
create policy shortlist_select_own on public.shortlist_ranks
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- matches / intents / partnership members: participants and admins.
-- ---------------------------------------------------------------------------
grant select on public.matches to authenticated;
create policy matches_select on public.matches
  for select to authenticated
  using (auth.uid() in (student_low, student_high) or private.is_admin());

grant select on public.partnership_intents to authenticated;
create policy intents_select on public.partnership_intents
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from public.matches m
      where m.id = match_id and auth.uid() in (m.student_low, m.student_high)
    )
  );

grant select on public.partnership_members to authenticated;
create policy members_select on public.partnership_members
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from public.matches m
      where m.id = match_id and auth.uid() in (m.student_low, m.student_high)
    )
  );

-- ---------------------------------------------------------------------------
-- reports: only administrators can read reports and their history.
-- Students file reports via submit_report().
-- ---------------------------------------------------------------------------
grant select on public.reports to authenticated;
create policy reports_select on public.reports
  for select to authenticated
  using (private.is_admin());

grant select on public.report_events to authenticated;
create policy report_events_select on public.report_events
  for select to authenticated using (private.is_admin());

-- ---------------------------------------------------------------------------
-- AI tables
-- ---------------------------------------------------------------------------
grant select on public.ai_insights to authenticated;
create policy ai_insights_select_own on public.ai_insights
  for select to authenticated using (viewer_id = auth.uid());

-- ai_usage: no policies → RPC only.
