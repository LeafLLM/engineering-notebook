// These functions are the boundary between the editor and Supabase.
// No passwords, secret keys, HTML rendering, or browser storage belong here.
export function createDocumentStore(client) {
  const fields =
    "id,team_id,title,mechanism,content,author_id,updated_by,created_at,updated_at,revision,archived";

  function check(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  return {
    async membership(userId) {
      const member = check(
        await client
          .from("team_members")
          .select("user_id,team_id,display_name,role")
          .eq("user_id", userId)
          .maybeSingle(),
      );
      if (!member) {
        const error = new Error(
          "Your account has no team yet. Ask the project owner to add your membership.",
        );
        error.code = "NO_TEAM";
        throw error;
      }
      const team = check(
        await client
          .from("teams")
          .select("id,name")
          .eq("id", member.team_id)
          .single(),
      );
      return { ...member, teamName: team.name };
    },

    async list(teamId) {
      return check(
        await client
          .from("documents")
          .select("id,title,mechanism,updated_at,revision,archived,author_id")
          .eq("team_id", teamId)
          .order("updated_at", { ascending: false }),
      );
    },

    async open(teamId, documentId) {
      return check(
        await client
          .from("documents")
          .select(fields)
          .eq("team_id", teamId)
          .eq("id", documentId)
          .single(),
      );
    },

    async archive(teamId, id, revision, archived) {
      const saved = check(
        await client
          .from("documents")
          .update({ archived })
          .eq("team_id", teamId)
          .eq("id", id)
          .eq("revision", revision)
          .select(fields)
          .maybeSingle(),
      );
      if (!saved)
        throw new Error(
          "This entry changed or your access changed. Refresh before trying again.",
        );
      return saved;
    },

    async remove(teamId, id, revision) {
      const removed = check(
        await client
          .from("documents")
          .delete()
          .eq("team_id", teamId)
          .eq("id", id)
          .eq("revision", revision)
          .eq("archived", true)
          .select("id")
          .maybeSingle(),
      );
      if (!removed)
        throw new Error(
          "This entry changed or you cannot delete it. Refresh before trying again.",
        );
      return removed;
    },
    async save(snapshot, alreadyCreated) {
      let result;
      if (alreadyCreated) {
        // Both filters matter: update this document only if its saved
        // revision still matches the one we opened or last saved.
        result = await client
          .from("documents")
          .update({
            title: snapshot.title,
            mechanism: snapshot.mechanism,
            content: snapshot.content,
          })
          .eq("team_id", snapshot.team_id)
          .eq("id", snapshot.id)
          .eq("revision", snapshot.revision)
          .select(fields)
          .maybeSingle();
      } else {
        result = await client
          .from("documents")
          .insert({
            id: snapshot.id,
            team_id: snapshot.team_id,
            title: snapshot.title,
            mechanism: snapshot.mechanism,
            content: snapshot.content,
          })
          .select(fields)
          .single();
      }
      const document = check(result);
      if (!document) {
        const error = new Error(
          "This document changed or your access changed. Reload it, or save your draft as a new document.",
        );
        error.code = "DOCUMENT_CONFLICT";
        throw error;
      }
      return document;
    },
  };
}
