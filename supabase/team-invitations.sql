-- Run after the existing team/account migrations. Does not move existing users.
begin;
create table if not exists public.team_invites (
    id uuid primary key default gen_random_uuid(),
    token uuid not null unique default gen_random_uuid(),
    team_id uuid not null references public.teams(id),
    email text not null,
    role text not null check (role in ('member', 'manager')),
    invited_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default now() + interval '7 days',
    revoked_at timestamptz,
    accepted_at timestamptz,
    accepted_by uuid references auth.users(id) on delete set null
);
alter table public.team_invites enable row level security;
revoke all on public.team_invites from public, anon, authenticated;
grant select on public.team_invites to authenticated;
drop policy if exists managers_read_invites on public.team_invites;
create policy managers_read_invites on public.team_invites for select to authenticated
using (exists (select 1 from public.team_members m where m.user_id = (select auth.uid())
    and m.team_id = team_invites.team_id and m.role = 'manager'));

create or replace function public.create_team_invite(invite_email text, invite_role text default 'member')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    caller uuid := auth.uid();
    selected_team uuid;
    new_token uuid;
begin
    select team_id into selected_team from public.team_members where user_id = caller;
    perform 1 from public.teams where id = selected_team for update;
    if not exists (select 1 from public.team_members where user_id = caller
        and team_id = selected_team and role = 'manager') then
        raise exception 'Only a team manager can create invitations.' using errcode = '42501';
    end if;
    if invite_email is null or length(btrim(invite_email)) > 254
        or btrim(invite_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        or invite_role is null or invite_role not in ('member', 'manager') then
        raise exception 'Enter a valid email and role.' using errcode = '22023';
    end if;
    update public.team_invites set revoked_at = now()
        where team_id = selected_team and email = lower(btrim(invite_email))
        and revoked_at is null and accepted_at is null;
    insert into public.team_invites(team_id, email, role, invited_by)
        values (selected_team, lower(btrim(invite_email)), invite_role, caller)
        returning token into new_token;
    return new_token;
end;
$$;

create or replace function public.revoke_team_invite(invite_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_team uuid;
begin
    select team_id into selected_team from public.team_members where user_id = auth.uid();
    perform 1 from public.teams where id = selected_team for update;
    if not exists (select 1 from public.team_members where user_id = auth.uid()
        and team_id = selected_team and role = 'manager') then
        raise exception 'Only a team manager can revoke invitations.' using errcode = '42501';
    end if;
    update public.team_invites set revoked_at = now()
        where id = invite_id and team_id = selected_team and accepted_at is null;
end;
$$;

create or replace function public.accept_team_invite(invite_token uuid, member_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    caller uuid := auth.uid();
    invitation public.team_invites%rowtype;
    caller_email text;
    confirmed timestamptz;
    existing_team uuid;
begin
    if caller is null then
        raise exception 'Sign in to accept this invitation.' using errcode = '42501';
    end if;
    if member_name is null or length(btrim(member_name)) not between 1 and 80 then
        raise exception 'Enter your name (1–80 characters).' using errcode = '22023';
    end if;
    select * into invitation from public.team_invites where token = invite_token;
    if not found then
        raise exception 'This invitation is invalid or unavailable.' using errcode = '22023';
    end if;
    -- Same lock order as role changes/revocation; acceptance cannot race them.
    perform 1 from public.teams where id = invitation.team_id for update;
    select * into invitation from public.team_invites where token = invite_token for update;
    select lower(email), email_confirmed_at into caller_email, confirmed
        from auth.users where id = caller for update;
    if confirmed is null or caller_email is distinct from invitation.email then
        raise exception 'Sign in with the invited email and confirm your email first.' using errcode = '42501';
    end if;
    if invitation.revoked_at is not null or invitation.expires_at <= now()
        or not exists (select 1 from public.team_members where user_id = invitation.invited_by
            and team_id = invitation.team_id and role = 'manager') then
        raise exception 'This invitation expired or was revoked. Ask a manager for a new link.' using errcode = '22023';
    end if;
    select team_id into existing_team from public.team_members where user_id = caller;
    if invitation.accepted_at is not null then
        if invitation.accepted_by = caller and existing_team = invitation.team_id then
            return existing_team; -- Retry after a lost response; never changes a role.
        end if;
        raise exception 'This invitation has already been used.' using errcode = '22023';
    end if;
    if existing_team is not null then
        raise exception 'You already belong to a team. This invitation cannot move your account.' using errcode = '42501';
    end if;
    insert into public.team_members(user_id, team_id, display_name, role)
        values (caller, invitation.team_id, btrim(member_name), invitation.role);
    update public.team_invites set accepted_at = now(), accepted_by = caller where id = invitation.id;
    return invitation.team_id;
end;
$$;

create or replace function public.set_team_member_role(member_id uuid, new_role text, expected_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_team uuid; saved_role text;
begin
    select team_id into selected_team from public.team_members where user_id = auth.uid();
    -- Serialize changes so concurrent demotions cannot remove every manager.
    perform 1 from public.teams where id = selected_team for update;
    if not exists (select 1 from public.team_members where user_id = auth.uid()
        and team_id = selected_team and role = 'manager') then
        raise exception 'Only a team manager can change access.' using errcode = '42501';
    end if;
    if new_role is null or new_role not in ('member', 'manager') then
        raise exception 'Choose member or manager.' using errcode = '22023';
    end if;
    select role into saved_role from public.team_members
        where user_id = member_id and team_id = selected_team;
    if not found then
        raise exception 'This person is not in your team.' using errcode = '42501';
    end if;
    if saved_role is distinct from expected_role then
        raise exception 'Their access changed. Refresh before trying again.' using errcode = '40001';
    end if;
    if saved_role = 'manager' and new_role = 'member' and
        (select count(*) from public.team_members where team_id = selected_team and role = 'manager') <= 1 then
        raise exception 'Your team must keep at least one manager.' using errcode = '22023';
    end if;
    update public.team_members set role = new_role where user_id = member_id and team_id = selected_team;
end;
$$;

create or replace function public.remove_team_member(member_id uuid, expected_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_team uuid; saved_role text; removed_email text;
begin
    select team_id into selected_team from public.team_members where user_id = auth.uid();
    perform 1 from public.teams where id = selected_team for update;
    if not exists (select 1 from public.team_members where user_id = auth.uid()
        and team_id = selected_team and role = 'manager') then
        raise exception 'Only a team manager can remove members.' using errcode = '42501';
    end if;
    select role into saved_role from public.team_members where user_id = member_id and team_id = selected_team;
    if not found then
        raise exception 'This person is not in your team.' using errcode = '42501';
    end if;
    if saved_role is distinct from expected_role then
        raise exception 'Their access changed. Refresh before trying again.' using errcode = '40001';
    end if;
    if saved_role = 'manager' and
        (select count(*) from public.team_members where team_id = selected_team and role = 'manager') <= 1 then
        raise exception 'Your team must keep at least one manager.' using errcode = '22023';
    end if;
    select lower(email) into removed_email from auth.users where id = member_id;
    update public.team_invites set revoked_at = now() where team_id = selected_team
        and accepted_at is null and revoked_at is null
        and (email = removed_email or invited_by = member_id);
    delete from public.team_members where user_id = member_id and team_id = selected_team;
end;
$$;

revoke all on function public.remove_team_member(uuid, text) from public, anon, authenticated;
grant execute on function public.remove_team_member(uuid, text) to authenticated;
revoke all on function public.create_team_invite(text, text), public.revoke_team_invite(uuid),
    public.accept_team_invite(uuid, text), public.set_team_member_role(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_team_invite(text, text), public.revoke_team_invite(uuid),
    public.accept_team_invite(uuid, text), public.set_team_member_role(uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
commit;
