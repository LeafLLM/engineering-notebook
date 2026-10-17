-- Run after setup.sql and management.sql. Existing members start as members.
begin;
alter table public.team_members add column if not exists role text not null default 'member'
    check (role in ('manager', 'member'));
alter table public.documents add column if not exists archived boolean not null default false;

create or replace function public.is_team_manager()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.team_members
    where user_id = (select auth.uid()) and role = 'manager') $$;
revoke all on function public.is_team_manager() from public, anon;
grant execute on function public.is_team_manager() to authenticated;

-- RLS checks the OLD task to determine who may edit it; the trigger below
-- stops an assignee from passing that check and then assigning it to someone else.
drop policy if exists create_team_items on public.team_items;
create policy create_team_items on public.team_items for insert to authenticated
    with check (team_id = (select public.current_team_id())
        and author_id = (select auth.uid())
        and (kind = 'resource' or (select public.is_team_manager())));
drop policy if exists update_team_items on public.team_items;
create policy update_team_items on public.team_items for update to authenticated
    using (team_id = (select public.current_team_id()) and
        (kind = 'resource' or (select public.is_team_manager()) or data->>'assignee' = (select auth.uid())::text))
    with check (team_id = (select public.current_team_id()) and
        (kind = 'resource' or (select public.is_team_manager()) or data->>'assignee' = (select auth.uid())::text));

create or replace function public.protect_task_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.kind = 'task' and not public.is_team_manager() then
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
            and not public.is_team_manager()
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
notify pgrst, 'reload schema';
commit;
