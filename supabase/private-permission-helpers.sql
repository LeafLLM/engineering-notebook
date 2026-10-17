-- Run AFTER setup.sql, management.sql, and roles-and-archives.sql.
-- Moves internal permission checks outside the exposed public API.
-- Does not change team memberships, records, or manager assignments.
-- Run this file last if you ever rerun the older migrations.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.current_team_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select team_id from public.team_members where user_id = (select auth.uid()) $$;
create or replace function private.is_team_manager()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.team_members
    where user_id = (select auth.uid()) and role = 'manager') $$;
revoke all on function private.current_team_id(), private.is_team_manager() from public, anon, authenticated;
-- Signed-in requests need these for RLS and triggers. Keep private OUT of
-- Supabase's exposed schemas; this grant does not expose a browser API endpoint.
grant execute on function private.current_team_id(), private.is_team_manager() to authenticated;

-- Replace stored policy references before removing the public helpers.
alter policy read_team_roster on public.team_members
    using (team_id = (select private.current_team_id()));
alter policy read_team_items on public.team_items
    using (team_id = (select private.current_team_id()));
alter policy create_team_items on public.team_items
    with check (team_id = (select private.current_team_id())
        and author_id = (select auth.uid())
        and (kind = 'resource' or (select private.is_team_manager())));
alter policy update_team_items on public.team_items
    using (team_id = (select private.current_team_id()) and
        (kind = 'resource' or (select private.is_team_manager()) or data->>'assignee' = (select auth.uid())::text))
    with check (team_id = (select private.current_team_id()) and
        (kind = 'resource' or (select private.is_team_manager()) or data->>'assignee' = (select auth.uid())::text));

-- Trigger function bodies also need the new schema-qualified names.
create or replace function public.protect_task_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.kind = 'task' and not private.is_team_manager() then
        if tg_op = 'INSERT' then
            raise exception 'Only a team manager can create tasks.' using errcode = '42501';
        end if;
        if old.data->>'assignee' is distinct from auth.uid()::text then
            raise exception 'Members can only update their assigned tasks.' using errcode = '42501';
        end if;
        if new.data->'assignee' is distinct from old.data->'assignee' then
            raise exception 'Only a team manager can assign tasks.' using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;
drop trigger if exists protect_task_assignment on public.team_items;
create trigger protect_task_assignment before insert or update on public.team_items
    for each row execute function public.protect_task_assignment();

-- Entries remain collaborative. Their author or a manager may archive/restore.
-- Archived entries are read-only until restored; restoring cannot also alter text.
create or replace function public.protect_document_archive()
returns trigger language plpgsql set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        if new.archived then
            raise exception 'Create an active entry before archiving it.' using errcode = '42501';
        end if;
    else
        if new.archived is distinct from old.archived
            and not private.is_team_manager()
            and old.author_id is distinct from auth.uid() then
            raise exception 'Only the author or a manager can archive or restore this entry.' using errcode = '42501';
        end if;
        if old.archived and (new.title is distinct from old.title
            or new.mechanism is distinct from old.mechanism
            or new.content is distinct from old.content) then
            raise exception 'Restore this entry before editing it.' using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;
drop trigger if exists protect_document_archive on public.documents;
create trigger protect_document_archive before insert or update on public.documents
    for each row execute function public.protect_document_archive();

-- No CASCADE: an unexpected remaining dependency aborts this transaction.
drop function if exists public.current_team_id();
drop function if exists public.is_team_manager();
notify pgrst, 'reload schema';
commit;

-- Both public_endpoint values should be NULL. Both internal_check values
-- should name functions in private. That confirms the move completed.
select to_regprocedure('public.current_team_id()') as public_endpoint,
       to_regprocedure('private.current_team_id()') as internal_check
union all
select to_regprocedure('public.is_team_manager()'),
       to_regprocedure('private.is_team_manager()');
