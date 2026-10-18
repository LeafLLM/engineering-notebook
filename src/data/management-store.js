// Data access only. The page code does not need to know how Supabase queries work.
export function createManagementStore(client) {
  function unwrap(result) {
    if (result.error) throw result.error;
    return result.data;
  }
  return {
    async members(teamId) {
      return unwrap(
        await client
          .from("team_members")
          .select("user_id,team_id,display_name,role")
          .eq("team_id", teamId),
      );
    },
    async list(teamId) {
      return unwrap(
        await client
          .from("team_items")
          .select("*")
          .eq("team_id", teamId)
          .order("updated_at", { ascending: false }),
      );
    },
    async remove(item) {
      const removed = unwrap(
        await client
          .from("team_items")
          .delete()
          .eq("team_id", item.team_id)
          .eq("id", item.id)
          .eq("revision", item.revision)
          .eq("archived", true)
          .select("id")
          .maybeSingle(),
      );
      if (!removed)
        throw new Error(
          "This item changed or you cannot delete it. Close the form and refresh before trying again.",
        );
      return removed;
    },
    async save(item) {
      const values = {
        title: item.title,
        data: item.data,
        archived: item.archived || false,
      };
      const query = item.revision
        ? client
            .from("team_items")
            .update(values)
            .eq("team_id", item.team_id)
            .eq("id", item.id)
            .eq("revision", item.revision)
        : client.from("team_items").insert({
            ...values,
            id: item.id,
            team_id: item.team_id,
            kind: item.kind,
          });
      const saved = unwrap(await query.select("*").maybeSingle());
      if (!saved)
        throw new Error(
          "A teammate changed this item. Your form is still here. Close it and refresh to review their version before editing again.",
        );
      return saved;
    },
  };
}
