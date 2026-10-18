// Supabase Auth owns passwords. Team creation goes through a permission-checked
// database function so the team and its first manager are created together.
export function createAccountStore(client) {
  return {
    async signUp(email, password, captchaToken) {
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { captchaToken },
      });
      if (error) throw error;
      return data;
    },
    async createTeam(teamName, displayName) {
      const { data, error } = await client.rpc("create_team", {
        team_name: teamName.trim(),
        member_name: displayName.trim(),
      });
      if (error) throw error;
      return data;
    },
  };
}
