// Permission checks run in the database; the browser never assigns roles directly.
export function createTeamAccessStore(client) {
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  return {
    async list(teamId) {
      const { data, error } = await client
        .from("team_invites")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    invite: (email, role) =>
      rpc("create_team_invite", {
        invite_email: email.trim(),
        invite_role: role,
      }),
    revoke: (id) => rpc("revoke_team_invite", { invite_id: id }),
    setRole: (person, role) =>
      rpc("set_team_member_role", {
        member_id: person.user_id,
        new_role: role,
        expected_role: person.role,
      }),
    removeMember: (person) =>
      rpc("remove_team_member", {
        member_id: person.user_id,
        expected_role: person.role,
      }),
    accept: (token, name) =>
      rpc("accept_team_invite", {
        invite_token: token,
        member_name: name.trim(),
      }),
  };
}
