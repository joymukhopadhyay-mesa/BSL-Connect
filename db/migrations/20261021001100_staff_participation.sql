-- BSL Connect — staff addresses that also take part as students
--
-- Students must use the student domain. A programme team address on another
-- MESA domain (e.g. a shared learning mailbox) can be given BOTH admin and
-- student access, but only if the database owner allowlists it with
-- participates = true. Nobody else can obtain a student account outside the
-- student domain: sign-up still requires the student domain or an allowlist
-- entry, and only this flag turns an allowlist entry into a student role.

alter table public.staff_allowlist add column participates boolean not null default false;

-- New accounts: student domain, or an allowlisted address flagged to participate,
-- become students (with a profile). Other allowlisted staff become admin-only.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff boolean;
  v_participates boolean;
begin
  select true, s.participates into v_staff, v_participates
  from public.staff_allowlist s where s.email = lower(btrim(new.email));
  v_staff := coalesce(v_staff, false);
  v_participates := coalesce(v_participates, false);

  if private.is_allowed_student_email(new.email) or (v_staff and v_participates) then
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

-- The two-argument version is replaced (otherwise calls would be ambiguous).
drop function private.provision_admin(text, text);

create function private.provision_admin(p_email text, p_note text default null, p_participate boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_user uuid;
  v_student boolean := private.is_allowed_student_email(v_email) or coalesce(p_participate, false);
begin
  if v_email is null or position('@' in v_email) < 2 then
    raise exception 'INVALID_EMAIL';
  end if;

  insert into public.staff_allowlist (email, note, participates)
  values (v_email, p_note, coalesce(p_participate, false))
  on conflict (email) do update
    set note = coalesce(excluded.note, public.staff_allowlist.note),
        participates = excluded.participates;

  select u.id into v_user from auth.users u where u.email = v_email;
  if v_user is not null then
    if v_student then
      insert into public.user_roles (user_id, role, is_admin) values (v_user, 'student', true)
      on conflict (user_id) do update set role = 'student', is_admin = true;
      insert into public.profiles (id) values (v_user) on conflict (id) do nothing;
    else
      insert into public.user_roles (user_id, role, is_admin) values (v_user, 'admin', true)
      on conflict (user_id) do update set role = 'admin', is_admin = true;
    end if;
    insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (null, 'admin_provisioned', 'user', v_user, jsonb_build_object('via', 'provision_admin', 'participates', v_student));
    return 'existing account promoted to admin';
  end if;
  return case when v_student
    then 'allowlisted; the account becomes admin + student on first sign-in'
    else 'allowlisted; the account becomes admin on first sign-in' end;
end;
$$;

revoke execute on function private.provision_admin(text, text, boolean) from public;
