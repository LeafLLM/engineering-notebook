-- Run AFTER setup.sql. Additive migration: existing documents stay intact.
begin;

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
commit;
