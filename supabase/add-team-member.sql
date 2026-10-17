-- First create this person's account under Authentication > Users.
-- Replace these four values, then run this in the SQL Editor for each person.
-- This is an administrator action: rerunning it can move that user to this team.
do $$
declare
    member_email text := 'CHANGE_ME@example.com';
    member_name text := 'Your name';
    team_name text := 'Team 3598';
    member_role text := 'member'; -- Choose 'manager' only for an intended manager.
    member_id uuid;
    selected_team_id uuid;
begin
    select id into member_id from auth.users where lower(email) = lower(member_email);
    if member_id is null then
        raise exception 'Create the account in Authentication > Users first: %', member_email;
    end if;

    select id into selected_team_id from public.teams where name = team_name;
    if selected_team_id is null then
        raise exception 'Team not found: %', team_name;
    end if;

    insert into public.team_members(user_id, team_id, display_name, role)
    values (member_id, selected_team_id, member_name, member_role)
    on conflict (user_id) do update
        set team_id = excluded.team_id, display_name = excluded.display_name, role = excluded.role;
end;
$$;
