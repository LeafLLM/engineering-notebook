# CAD Notebook — Team 3598 prototype

A collaborative CAD management app built with **HTML, CSS, plain JavaScript, Quill, and Supabase**. No framework or build step is required. The three sections are **Overview, Documenting, and Resources**. There is no whiteboard.

## Run and try it

From this folder:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

- Open **http://127.0.0.1:8000/?demo=1** for the Team 3598 practice management.
- Open **http://127.0.0.1:8000/** for the shared Supabase workspace.
- Stop the server with Ctrl+C. Use an HTTP server rather than double-clicking the HTML file.

Demo mode starts with fictional tasks, people, a sample entry, and starter resources. It saves to this browser's local storage. It never signs into or writes to Supabase, and it is **not shared with teammates**. Switching to the shared workspace does not copy demo content. Clearing browser data removes the demo. Images count toward browser storage limits; failed saves report an error and retain the draft. Internet is needed to load Quill and the Supabase browser library.

## What works

- **Overview:** create/edit tasks, assign actual management members, set dates/status/notes, filter by assignee/completion, and archive/restore. Counts, a monthly task calendar, recent entries, deadline sidebar, and your nearest assigned deadline all derive from saved records. Calendar dates filter the timeline; other active filters still apply.
- **Documenting:** entries grouped by mechanism, design prompts for new entries, rich text, links, PNG/JPG/WebP images up to 1 MB each, autosave after creation, manual save, and protection against conflicting edits. Prompts are inserted without replacing existing writing. The prompts follow the notebook's problem → constraints → research → reasoning → tests → next steps workflow.
- **Resources:** searchable parts, references, and tips with optional links, editable notes, and reversible archives.
- **Collaboration:** authenticated members share a management's records. Use **Refresh** to load teammates' latest changes. Concurrent stale saves are rejected; there are no live cursors or simultaneous text merging.

## Connect the shared management

The browser project URL and publishable key are already in `supabase-client.js`. The new migration has been tested locally; **it has not been applied to the live Supabase project**.

1. Run `supabase/setup.sql` in Supabase's SQL Editor if you have not already. It creates the existing document system and its original `Engineering team` workspace.
2. Run `supabase/management.sql`. This adds tasks/resources, teammate roster access, and a separate management called **Team 3598**. Both scripts can be rerun without deleting existing documents. Existing teams are not renamed or moved.
3. Create/confirm individual accounts in **Authentication → Users**. Enter passwords there, never in source code.
4. Edit the email and display name in `supabase/add-team-member.sql` and run it for each intended member. Its team name now defaults to **Team 3598**. This is an administrator operation: rerunning it for an existing account changes that account's team. It does not migrate documents from the old team.
5. Sign in at the shared URL. Create your real Team 3598 tasks, resources, and entries there.

Every record has a `team_id`, and database row-level security checks membership. The browser's filters are for convenience; database policies provide isolation. Members have equal editing rights in this prototype. Membership is administered in Supabase, not through a public invitation form.

Other managements can be added as rows in `teams` and used by the same app. One account belongs to one management in this version. Self-service team creation, invitations, roles, and membership in multiple teams are future work.

Use only a **publishable** key in browser code. Never add a service-role key, secret key, password, or database connection password to source files.

## Understand the code

Start with **LEARNING-GUIDE.md**. It walks one task through the page, JavaScript, data store, and database and explains how this can transition to React.

| File | Responsibility |
| --- | --- |
| `index.html` | Three page sections, forms, editor, and deadline rail |
| `style.css` | Layout, colors, components, and responsive rules |
| `script.js` | Hash-based tab navigation and browser Back support |
| `documents.js` | Sign-in/session handling, Quill, document state and saves |
| `document-store.js` | Supabase document queries |
| `management.js` | Tasks, calendar, resources, filters, dialogs, and rendering |
| `management-store.js` | Supabase management record queries |
| `demo-store.js` | Explicit local practice mode with the same store interfaces |
| `supabase/setup.sql` | Existing document tables, access, authors, and revisions |
| `supabase/management.sql` | Management records, roster policy, and validation |

`CODE-WALKTHROUGH.md` is the earlier detailed explanation of the document editor. Its old layout descriptions and line numbers predate this prototype; use the new guide for current architecture.

## Check the app

```powershell
pnpm install
pnpm test
pnpm test:browser
```

The tests use PGlite, an in-memory PostgreSQL database, to run the actual schemas and access policies with disposable accounts. They do not contact live Supabase. The browser test server prints a loopback URL and fictional login credentials. Never deploy that test server: its auth facade is intentionally only for local tests.

Useful manual checks:

1. Add a task assigned to someone, reload, and verify its deadline and calendar dot.
2. Mark it Done. Check Completed, archive it, then restore it from Archived.
3. Add a resource, search for it, and change its category.
4. Create an entry with prompts and an image. Reload and reopen it.
5. Sign in as two teammates using different browser profiles. Open the same item in both, save one, then try saving the stale copy. The second draft must remain open with an error.
6. Sign out. Team records and the editor must disappear. An account from another team must not see them.

## Reference and ownership

The implementation follows the provided [CAD notebook](https://docs.google.com/document/d/1PaOLd9hoCn5PGa7WApC8jFONI0GOjuimhIQUdHLaJSI/edit?tab=t.0) and [Excalidraw architecture](https://excalidraw.com/#json=kVGo-zqSDDqN5iioLqQs5,T4lU0dzR8fblXFDPdjH8jw): mechanism-grouped documentation, design reasoning, deadlines by assignee, an immediate-task reminder, a calendar, and a resource catalog. Personal contact details and private notebook images were not imported into demo data.

The student supplied the concept, architecture, notebook workflow, initial frontend, and Quill quickstart. AI assistance includes implementation and explanations for styling, document persistence, task/resource flows, the demo adapter, database policies, and tests. Review this description before hackathon submission to reflect the assistance actually used.

Official learning references: [Quill API](https://quilljs.com/docs/api), [Supabase authentication](https://supabase.com/docs/guides/auth/passwords), [Supabase returned rows](https://supabase.com/docs/reference/javascript/using-modifiers-select), and [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
