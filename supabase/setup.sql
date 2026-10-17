-- Run this in your project's Supabase SQL Editor. It doesn't create passwords.
-- One team per user for this version. Membership is managed in the dashboard.
begin;

create table if not exists public.teams (
    id uuid primary key default gen_random_uuid(),
    name text not null unique check (length(btrim(name)) > 0)
);

create table if not exists public.team_members (
    user_id uuid primary key references auth.users(id) on delete cascade,
    team_id uuid not null references public.teams(id),
    display_name text not null check (length(btrim(display_name)) > 0)
);

create table if not exists public.documents (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.teams(id),
    title text not null check (length(btrim(title)) > 0),
    mechanism text not null default 'General' check (length(btrim(mechanism)) > 0),
    content jsonb not null default '{"ops":[{"insert":"\n"}]}'::jsonb,
    author_id uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    revision integer not null default 1,
    constraint document_content_is_delta check (
        jsonb_typeof(content) = 'object'
        and content ? 'ops'
        and jsonb_typeof(content -> 'ops') = 'array'
    )
);

create index if not exists documents_team_updated_idx
    on public.documents(team_id, updated_at desc);

-- The server owns authorship, dates and revisions. A revision lets the app
-- detect another person's save rather than overwriting it with an older copy.
create or replace function public.prepare_document_save()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'UPDATE' then
        if new.team_id is distinct from old.team_id
            or new.author_id is distinct from old.author_id
            or new.id is distinct from old.id then
            raise exception 'Document identity, team, and author cannot be changed.'
                using errcode = '42501';
        end if;
        new.created_at := old.created_at;
        new.revision := old.revision + 1;
    else
        new.author_id := auth.uid();
        new.created_at := now();
        new.revision := 1;
    end if;
    new.updated_by := auth.uid();
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists prepare_document_save on public.documents;
create trigger prepare_document_save
    before insert or update on public.documents
    for each row execute function public.prepare_document_save();

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.documents enable row level security;

-- No public records, self-enrollment, or document deletion from the browser.
revoke all on public.teams, public.team_members, public.documents from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.teams, public.team_members to authenticated;
grant select, insert, update on public.documents to authenticated;

-- Members can look up their own membership. This policy does not query itself,
-- so checking team membership in the other policies cannot cause recursion.
drop policy if exists read_own_membership on public.team_members;
create policy read_own_membership on public.team_members
    for select to authenticated
    using (user_id = (select auth.uid()));

drop policy if exists read_own_team on public.teams;
create policy read_own_team on public.teams
    for select to authenticated
    using (exists (
        select 1 from public.team_members m
        where m.team_id = teams.id and m.user_id = (select auth.uid())
    ));

drop policy if exists read_team_documents on public.documents;
create policy read_team_documents on public.documents
    for select to authenticated
    using (exists (
        select 1 from public.team_members m
        where m.team_id = documents.team_id and m.user_id = (select auth.uid())
    ));

drop policy if exists create_team_documents on public.documents;
create policy create_team_documents on public.documents
    for insert to authenticated
    with check (
        author_id = (select auth.uid())
        and updated_by = (select auth.uid())
        and exists (
            select 1 from public.team_members m
            where m.team_id = documents.team_id and m.user_id = (select auth.uid())
        )
    );

drop policy if exists update_team_documents on public.documents;
create policy update_team_documents on public.documents
    for update to authenticated
    using (exists (
        select 1 from public.team_members m
        where m.team_id = documents.team_id and m.user_id = (select auth.uid())
    ))
    with check (
        updated_by = (select auth.uid())
        and exists (
            select 1 from public.team_members m
            where m.team_id = documents.team_id and m.user_id = (select auth.uid())
        )
    );

insert into public.teams(name) values ('Engineering team')
    on conflict (name) do nothing;

notify pgrst, 'reload schema';
commit;
