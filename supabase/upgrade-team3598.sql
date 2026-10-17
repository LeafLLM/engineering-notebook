-- Team 3598 upgrade: preserves the existing team ID and all entries.
-- Run in the Supabase SQL Editor after setup.sql. Includes both migrations.
begin;
do $$
begin
  if not exists(select 1 from public.team_members m join auth.users u on u.id=m.user_id join public.teams t on t.id=m.team_id where u.email='maidiaz1466@gmail.com' and t.name in ('Engineering team','Team 3598')) then
    raise exception 'Expected manager membership not found; no changes applied.';
  end if;
  if exists(select 1 from public.teams where name='Engineering team') and exists(select 1 from public.teams where name='Team 3598') then
    raise exception 'Both team names exist; review memberships before upgrading.';
  end if;
end $$;
update public.teams set name='Team 3598' where name='Engineering team';
-- Run AFTER setup.sql. Additive migration: existing documents stay intact.

-- A management is a team. All its records carry this team's ID.
insert into public.teams(name) values ('Team 3598') on conflict (name) do nothing;

-- A fixed, caller-scoped helper avoids recursive membership policies.
create or replace function public.current_team_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select team_id from public.team_members where user_id = (select auth.uid()) $$;
revoke all on function public.current_team_id() from public, anon;
grant execute on function public.current_team_id() to authenticated;

drop policy if exists read_team_roster on public.team_members;
create policy read_team_roster on public.team_members for select to authenticated
    using (team_id = (select public.current_team_id()));

-- Two small record shapes, one common save/revision/access pattern.
-- task data: mechanism, assignee (member UUID or empty), due (YYYY-MM-DD), status, notes
-- resource data: category (Part/Reference/Tip), url, notes
create table if not exists public.team_items (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.teams(id),
    kind text not null check (kind in ('task', 'resource')),
    title text not null check (length(btrim(title)) between 1 and 160),
    data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
    archived boolean not null default false,
    author_id uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    revision integer not null default 1
);
create index if not exists team_items_team_idx on public.team_items(team_id, updated_at desc);

create or replace function public.validate_team_item()
returns trigger language plpgsql set search_path = '' as $$
begin
    if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
        raise exception 'An item cannot change kind.' using errcode = '42501';
    end if;
    if new.kind = 'task' then
        if coalesce(new.data->>'status', '') not in ('To do', 'In progress', 'Done') then
            raise exception 'Choose a valid task status.' using errcode = '23514';
        end if;
        if coalesce(new.data->>'assignee', '') <> '' and not exists (
            select 1 from public.team_members where team_id = new.team_id
                and user_id::text = new.data->>'assignee'
        ) then
            raise exception 'Assignee must belong to this team.' using errcode = '23514';
        end if;
        if coalesce(new.data->>'due', '') <> '' then
            perform (new.data->>'due')::date;
        end if;
    end if;
    return new;
end;
$$;
drop trigger if exists validate_team_item on public.team_items;
create trigger validate_team_item before insert or update on public.team_items
    for each row execute function public.validate_team_item();
-- Reuse the existing trigger for server-owned authors, dates, and revisions.
drop trigger if exists prepare_team_item_save on public.team_items;
create trigger prepare_team_item_save before insert or update on public.team_items
    for each row execute function public.prepare_document_save();

alter table public.team_items enable row level security;
revoke all on public.team_items from public, anon, authenticated;
grant select, insert, update on public.team_items to authenticated;
drop policy if exists read_team_items on public.team_items;
create policy read_team_items on public.team_items for select to authenticated
    using (team_id = (select public.current_team_id()));
drop policy if exists create_team_items on public.team_items;
create policy create_team_items on public.team_items for insert to authenticated
    with check (team_id = (select public.current_team_id()) and author_id = (select auth.uid()));
drop policy if exists update_team_items on public.team_items;
create policy update_team_items on public.team_items for update to authenticated
    using (team_id = (select public.current_team_id()))
    with check (team_id = (select public.current_team_id()));
notify pgrst, 'reload schema';

-- Run after setup.sql and management.sql. Existing members start as members.

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

update public.team_members m set role='manager' from auth.users u, public.teams t where m.user_id=u.id and m.team_id=t.id and u.email='maidiaz1466@gmail.com' and t.name='Team 3598';
commit;
select t.name, m.role, (select count(*) from public.documents d where d.team_id=t.id) preserved_entries from public.team_members m join auth.users u on u.id=m.user_id join public.teams t on t.id=m.team_id where u.email='maidiaz1466@gmail.com';
