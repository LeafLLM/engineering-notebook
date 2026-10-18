-- Run after the existing setup, management and roles/archive migrations.
-- Grants permanent deletion ONLY for archived records in the caller's team.
begin;
grant delete on public.documents, public.team_items to authenticated;

drop policy if exists delete_archived_documents on public.documents;
create policy delete_archived_documents on public.documents
for delete to authenticated using (
    archived and exists (
        select 1 from public.team_members m
        where m.user_id = (select auth.uid()) and m.team_id = documents.team_id
        and (m.role = 'manager' or documents.author_id = m.user_id)
    )
);

drop policy if exists delete_archived_items on public.team_items;
create policy delete_archived_items on public.team_items
for delete to authenticated using (
    archived and exists (
        select 1 from public.team_members m
        where m.user_id = (select auth.uid()) and m.team_id = team_items.team_id
        and (m.role = 'manager'
            or (team_items.kind = 'task' and team_items.data->>'assignee' = m.user_id::text)
            or (team_items.kind = 'resource' and team_items.author_id = m.user_id))
    )
);
notify pgrst, 'reload schema';
commit;
