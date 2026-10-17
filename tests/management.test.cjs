const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createTestDatabase, asUser, users } = require("./fixtures.cjs");

test("team management isolates data and protects collaborators' saves", async t => {
    const { db, mainTeam, otherTeam } = await createTestDatabase();
    const [sam, taylor, outsider, unassigned] = users;
    let task;
    try {
        await t.test("Team 3598 exists without renaming existing teams", async () => {
            assert.equal((await db.query("select name from teams where name='Team 3598'")).rows.length, 1);
            assert.equal((await db.query("select name from teams where id=$1", [mainTeam])).rows[0].name, "Engineering team");
        });
        await t.test("roster contains only the caller's team", async () => {
            assert.equal((await asUser(db, sam.id, "select * from team_members")).rows.length, 2);
            assert.equal((await asUser(db, outsider.id, "select * from team_members")).rows.length, 1);
            assert.equal((await asUser(db, unassigned.id, "select * from team_members")).rows.length, 0);
            await assert.rejects(asUser(db, null, "select public.current_team_id()"), { code: "42501" });
        });
        await t.test("create assigns the server author and stores a teammate assignment", async () => {
            task = (await asUser(db, sam.id, `insert into team_items(team_id,kind,title,data,author_id)
                values ($1,'task','Check clearances',$2,$3) returning *`,
                [mainTeam, JSON.stringify({ status: "To do", assignee: taylor.id, due: "2026-10-20" }), outsider.id])).rows[0];
            assert.equal(task.author_id, sam.id);
            assert.equal(task.revision, 1);
            assert.equal((await asUser(db, taylor.id, "select * from team_items")).rows.length, 1);
        });
        await t.test("reject cross-team assignments and invalid status", async () => {
            for (const data of [{ status: "To do", assignee: outsider.id }, { status: "invalid" }]) {
                await assert.rejects(asUser(db, sam.id,
                    "insert into team_items(team_id,kind,title,data) values ($1,'task','Invalid',$2)",
                    [mainTeam, JSON.stringify(data)]), { code: "23514" });
            }
        });
        await t.test("foreign teams, unassigned accounts, and anonymous users cannot access records", async () => {
            for (const user of [outsider, unassigned]) {
                assert.equal((await asUser(db, user.id, "select * from team_items")).rows.length, 0);
                assert.equal((await asUser(db, user.id, "update team_items set title='Bad' returning id")).rows.length, 0);
                await assert.rejects(asUser(db, user.id,
                    "insert into team_items(team_id,kind,title) values ($1,'resource','Bad')", [mainTeam]), { code: "42501" });
            }
            await assert.rejects(asUser(db, null, "select * from team_items"), { code: "42501" });
        });
        await t.test("stale updates cannot overwrite and archived items can be restored", async () => {
            const saved = (await asUser(db, taylor.id, "update team_items set archived=true where id=$1 and revision=1 returning *", [task.id])).rows[0];
            assert.equal(saved.revision, 2);
            assert.equal(saved.updated_by, taylor.id);
            assert.equal(saved.author_id, sam.id);
            assert.equal((await asUser(db, sam.id, "update team_items set title='Stale' where id=$1 and revision=1 returning id", [task.id])).rows.length, 0);
            assert.equal((await asUser(db, sam.id, "update team_items set archived=false where id=$1 and revision=2 returning archived", [task.id])).rows[0].archived, false);
        });
        await t.test("identity, team, and kind cannot be changed and deletion is disabled", async () => {
            await assert.rejects(asUser(db, sam.id, "update team_items set team_id=$1 where id=$2", [otherTeam, task.id]), { code: "42501" });
            await assert.rejects(asUser(db, sam.id, "update team_items set kind='resource' where id=$1", [task.id]), { code: "42501" });
            await assert.rejects(asUser(db, sam.id, "delete from team_items"), { code: "42501" });
        });
        await t.test("resource persistence and idempotent migration", async () => {
            const data = { category: "Tip", notes: "Keep the parts together", url: "" };
            await asUser(db, sam.id, "insert into team_items(team_id,kind,title,data) values ($1,'resource','Assembly export',$2)", [mainTeam, JSON.stringify(data)]);
            await db.exec(readFileSync(resolve(__dirname, "../supabase/management.sql"), "utf8"));
            assert.deepEqual((await asUser(db, taylor.id, "select data from team_items where kind='resource'")).rows[0].data, data);
        });
    } finally { await db.close(); }
});
