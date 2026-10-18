-- Run after setup.sql, management.sql, roles-and-archives.sql and
-- private-permission-helpers.sql. Existing teams and memberships are preserved.
begin;

create or replace function public.create_team(team_name text, member_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
    caller uuid := auth.uid();
    new_team uuid;
begin
    if caller is null then
        raise exception 'Sign in before creating a team.' using errcode = '42501';
    end if;
    if team_name is null or length(btrim(team_name)) not between 1 and 100
        or member_name is null or length(btrim(member_name)) not between 1 and 80 then
        raise exception 'Enter a team name (1–100 characters) and your name (1–80 characters).'
            using errcode = '22023';
    end if;

    -- Serialize requests from this account, including simultaneous clicks/tabs.
    perform 1 from auth.users where id = caller for update;
    if not found then
        raise exception 'Sign in before creating a team.' using errcode = '42501';
    end if;
    if exists (select 1 from public.team_members where user_id = caller) then
        raise exception 'You already belong to a team.' using errcode = '42501';
    end if;
    -- Case-insensitive collision check, also serializing concurrent name checks.
    perform pg_catalog.pg_advisory_xact_lock(807314);
    if exists (select 1 from public.teams where lower(btrim(name)) = lower(btrim(team_name))) then
        raise exception 'That team name is already in use. Choose another name.'
            using errcode = '23505';
    end if;
    insert into public.teams(name) values (btrim(team_name)) returning id into new_team;
    insert into public.team_members(user_id, team_id, display_name, role)
        values (caller, new_team, btrim(member_name), 'manager');
    return new_team;
end;
$$;

revoke all on function public.create_team(text, text) from public, anon, authenticated;
grant execute on function public.create_team(text, text) to authenticated;
notify pgrst, 'reload schema';
commit;
