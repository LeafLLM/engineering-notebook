const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { users, createTestDatabase, asUser } = require("./fixtures.cjs");

test("manager permissions and reversible entry archives", async t => {
    const { db, mainTeam } = await createTestDatabase();
    const [manager, member] = users;
    const insertTask = assignee => asUser(db, manager.id,
        "insert into team_items(team_id,kind,title,data) values ($1,'task','Task',$2) returning *",
        [mainTeam, JSON.stringify({ assignee, status: "To do", notes: "Original" })]);
    try {
        const mine = (await insertTask(member.id)).rows[0];
        const theirs = (await insertTask(manager.id)).rows[0];
        const unassigned = (await insertTask("")).rows[0];
        await t.test("members cannot create tasks, even assigned to themselves", async () => {
            await assert.rejects(asUser(db, member.id,
                "insert into team_items(team_id,kind,title,data) values ($1,'task','Self-created',$2)",
                [mainTeam, JSON.stringify({ assignee: member.id, status: "To do" })]), { code: "42501" });
        });
        await t.test("members can edit and archive/restore their own assigned tasks", async () => {
            const result = await asUser(db, member.id,
                "update team_items set data=data || '{\"status\":\"Done\",\"notes\":\"Tested\"}'::jsonb, archived=true where id=$1 returning *", [mine.id]);
            assert.equal(result.rows[0].archived, true);
            assert.equal(result.rows[0].data.status, "Done");
            assert.equal((await asUser(db, member.id, "update team_items set archived=false where id=$1 returning *", [mine.id])).rows[0].archived, false);
        });
        await t.test("members cannot edit or claim another person's or unassigned tasks", async () => {
            for (const task of [theirs, unassigned]) {
                assert.equal((await asUser(db, member.id,
                    "update team_items set title='Not mine', archived=true where id=$1 returning id", [task.id])).rows.length, 0);
                assert.equal((await asUser(db, member.id,
                    "update team_items set data=jsonb_set(data,'{assignee}',to_jsonb($2::text)) where id=$1 returning id", [task.id, member.id])).rows.length, 0);
            }
        });
        await t.test("members cannot reassign or unassign their own tasks", async () => {
            for (const assignee of [manager.id, ""]) await assert.rejects(asUser(db, member.id,
                "update team_items set data=jsonb_set(data,'{assignee}',to_jsonb($2::text)) where id=$1", [mine.id, assignee]), { code: "42501" });
        });
        await t.test("managers can reassign tasks; the old assignee immediately loses edit access", async () => {
            await asUser(db, manager.id, "update team_items set data=jsonb_set(data,'{assignee}',to_jsonb($2::text)) where id=$1", [mine.id, manager.id]);
            assert.equal((await asUser(db, member.id, "update team_items set title='Stale access' where id=$1 returning id", [mine.id])).rows.length, 0);
        });
        await t.test("members cannot promote themselves or teammates", async () => {
            await assert.rejects(asUser(db, member.id, "update team_members set role='manager'"), { code: "42501" });
        });
        const content = JSON.stringify({ ops: [{ insert: "Keep this writing\n" }] });
        const ownEntry = (await asUser(db, member.id, "insert into documents(team_id,title,content) values ($1,'Member entry',$2) returning *", [mainTeam, content])).rows[0];
        const managerEntry = (await asUser(db, manager.id, "insert into documents(team_id,title) values ($1,'Manager entry') returning *", [mainTeam])).rows[0];
        await t.test("only author or manager can archive an entry", async () => {
            await assert.rejects(asUser(db, member.id, "update documents set archived=true where id=$1", [managerEntry.id]), { code: "42501" });
            const archived = (await asUser(db, member.id, "update documents set archived=true where id=$1 and revision=1 returning *", [ownEntry.id])).rows[0];
            assert.equal(archived.archived, true);
            assert.equal(archived.revision, 2);
            assert.deepEqual(archived.content, JSON.parse(content));
        });
        await t.test("archived entries are readable but cannot be edited, including on restore", async () => {
            assert.equal((await asUser(db, manager.id, "select * from documents where id=$1", [ownEntry.id])).rows[0].archived, true);
            await assert.rejects(asUser(db, manager.id, "update documents set title='Changed' where id=$1", [ownEntry.id]), { code: "42501" });
            await assert.rejects(asUser(db, member.id, "update documents set archived=false, title='Changed' where id=$1", [ownEntry.id]), { code: "42501" });
            assert.equal((await asUser(db, member.id, "update documents set archived=false where id=$1 and revision=1 returning id", [ownEntry.id])).rows.length, 0);
            assert.equal((await asUser(db, manager.id, "update documents set archived=false where id=$1 and revision=2 returning *", [ownEntry.id])).rows[0].archived, false);
        });
        await t.test("active entries remain collaborative and archives survive repeated migration", async () => {
            await asUser(db, member.id, "update documents set title='Collaborative edit' where id=$1", [managerEntry.id]);
            await asUser(db, manager.id, "update documents set archived=true where id=$1", [ownEntry.id]);
            await db.exec(readFileSync(resolve(__dirname, "../supabase/roles-and-archives.sql"), "utf8"));
            assert.equal((await asUser(db, member.id, "select archived from documents where id=$1", [ownEntry.id])).rows[0].archived, true);
        });
    } finally { await db.close(); }
});
