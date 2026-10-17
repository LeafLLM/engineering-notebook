# Learn the prototype by following one task

This app stays in HTML, CSS, and JavaScript. There is no React, bundler, or hidden generated application layer. Quill provides rich-text editing; Supabase provides accounts and shared storage.

## First, try the flow

Start the server as described in README.md, then open `?demo=1`. Add a task, assign it to You (demo), give it a date, and save. Notice four changes: the timeline gains a row, the open-task count increases, a date gains a calendar dot, and the deadline rail may change. These are four views of **one saved task**, not four copies of it.

Next, mark it Done. The task remains stored, but the Active filter and deadline rail stop showing it. Archive hides it from normal views; Restore reverses that. We do not delete the row.

## The four layers

```text
index.html             management.js          management-store.js       Supabase
inputs and buttons --> read form, track state --> insert or update --> team_items
                       render saved result  <-- returned record    <-- access checks
```

1. **HTML is the structure.** Search `index.html` for `item-form`. Its title, date, assignment, status, and notes fields are the form you used. IDs give JavaScript a stable way to find an element.
2. **Page JavaScript coordinates the interaction.** In `management.js`, the submit listener reads those fields and creates an ordinary object. `saveItem()` sends that object to the store. It only changes the displayed records after a successful save.
3. **The store knows the database.** In `management-store.js`, `save()` inserts if there is no saved revision. Otherwise, it updates the matching team, ID, and revision. It returns the saved row or throws an error.
4. **The database enforces access.** `supabase/management.sql` checks team membership, assignment, immutable identity, author, and revision. A user cannot gain access merely by changing a team ID in the browser.

## What a task looks like

```js
{
  id: "a unique identifier",
  team_id: "the management this belongs to",
  kind: "task",
  title: "Review spindexer clearances",
  data: {
    mechanism: "Spindexer",
    assignee: "a team member's user ID",
    due: "2026-10-21",
    status: "In progress",
    notes: "Capture the tightest gap in a screenshot."
  },
  archived: false,
  revision: 1
}
```

A resource uses the same shared fields, with `kind: "resource"` and `data: { category, url, notes }`. JSON keeps these two small prototype shapes simple. If the app grows, separate task/resource tables would make field-specific constraints and reporting easier. Documents already have their own table because their rich-text content and save workflow are different.

`team_id` is the important boundary for future managements. The shared app gets it from the signed-in user's membership; it does not hard-code Team 3598 into database queries. Team 3598's hard-coded demo ID is used only in practice mode.

## State and rendering

Near the top of `management.js`, `member`, `members`, `items`, and `documents` hold the currently displayed state. `renderTasks()`, `renderResources()`, and `renderCalendar()` turn that state into page elements.

The helper `element()` assigns user text through `textContent`. It does not build HTML strings from user input. A title such as `<b>bracket</b>` appears as text rather than being interpreted as markup.

`busy` temporarily disables save controls. `formDirty` tracks unsaved form edits. `epoch` is a counter that changes with the account session: if an old request finishes after sign-out, its result is ignored rather than showing the previous account's records.

Dates from a date input are calendar dates (`YYYY-MM-DD`), not UTC timestamps. The UI interprets them as local dates so a deadline does not shift to the previous day. Server save times are full timestamps.

## How the editor connects

`documents.js` already owned sign-in and the editor, so it remains responsible for that workflow. It announces two browser events:

- `notebook:session` passes the membership or `null` when signed out.
- `notebook:documents` passes the latest document list.

`management.js` listens and updates the overview. Clicking an overview entry sends `notebook:open-entry` back to the editor. This keeps the overview from reaching into Quill's internal state. The document store still handles all its database requests.

New entries start with questions from the reference notebook. The template inserts text and explicitly marks it as dirty, including while navigation temporarily disables typing. Images are read into a data URL and included in the saved Quill Delta. That is simple to inspect for a prototype; a future version should put larger files in private Supabase Storage and keep references in the document. A 1 MB image limit applies to the image picker, not the entire document.

## Why revisions matter

Suppose Sam and Taylor both open revision 3. Taylor saves, so the database returns revision 4. Sam's later update includes `revision = 3`. No row now matches, so the store reports a conflict. Sam's form stays open.

For tasks/resources, close the form and refresh to review the latest version, then reapply your edit. Copy any draft text you want to preserve before closing. For documents, the existing editor also offers **Save draft as new document**. This is conflict detection, not Google Docs-style simultaneous editing. Use Refresh to see changes from other people.

## Why the demo is separate

`demo-store.js` runs only when the URL explicitly contains `demo=1`. It exposes `documents` and `management` stores with the same methods as the Supabase versions. The page can therefore run the same forms and rendering functions without pretending local changes are shared.

Demo writes use local storage and, where available, a browser lock to serialize writes across tabs. Data is separate from Supabase, survives refresh in the same browser/origin, and can be lost when that browser's data is cleared. It is for practice, not team backups.

## What to read next

1. `script.js`: a small example of functions, arrays, loops, and events.
2. `index.html`: find the three sections and shared form IDs.
3. `management-store.js`: the small insert/update boundary.
4. `management.js`: follow `openForm()` → form submit → `saveItem()` → `render()`.
5. `documents.js`: follow a create, an autosave, and a conflicting save.
6. The two SQL files: compare browser visibility with database permission checks.

Small learning exercises: change an accent color in `:root`; add a second resource category and update its choices; add a task priority field to the form and data object; show priority in the table. For any new field, trace it through input, saved object, rendering, and validation instead of only changing its appearance.

## Moving to React later

Keep the store APIs and database policies. Replace the page rendering functions one section at a time with components: `Overview`, `TaskForm`, `DeadlineSidebar`, `DocumentLibrary`, and `Resources`. Move state into React state/hooks, and use a shared session context instead of window events. Quill and its lifecycle need an editor component. There is no need to rewrite the database just because the view layer changes.

Before broader use, add deliberate invitations/roles, account membership in multiple teams if needed, private file storage, recovery/backups, and a deployment workflow. Those are separate features; the current prototype assumes an administrator creates accounts and assigns memberships.
