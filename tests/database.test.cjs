const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { users, createTestDatabase, asUser } = require("./fixtures.cjs");

test("shared documents enforce membership, persistence, and revisions", async t => {
    const { db, mainTeam, otherTeam } = await createTestDatabase();
    const [sam, taylor, outsider, unassigned] = users;
    const content = { ops: [
        { insert: "Mounting changes", attributes: { bold: true } },
        { insert: "\n", attributes: { header: 1 } },
        { insert: "Test the bracket" }, { insert: "\n", attributes: { list: "bullet" } }
    ] };
    let document;
    try {
        await t.test("create stores rich text and assigns the authenticated author", async () => {
            const result = await asUser(db, sam.id, `
                insert into public.documents(team_id,title,mechanism,content,author_id,revision)
                values ($1,'Mounting notes','Drivetrain',$2,$3,99) returning *
            `, [mainTeam, JSON.stringify(content), taylor.id]);
            document = result.rows[0];
            assert.deepEqual(document.content, content);
            assert.equal(document.author_id, sam.id);
            assert.equal(document.updated_by, sam.id);
            assert.equal(document.revision, 1);
        });

        await t.test("the other team member can read the saved document", async () => {
            const result = await asUser(db, taylor.id, "select * from public.documents where id=$1", [document.id]);
            assert.equal(result.rows.length, 1);
            assert.deepEqual(result.rows[0].content, content);
        });

        await t.test("editing updates the same row and preserves its original author", async () => {
            const result = await asUser(db, taylor.id, `
                update public.documents set title='Updated mounting notes', revision=500
                where id=$1 and revision=1 returning *
            `, [document.id]);
            assert.equal(result.rows[0].id, document.id);
            assert.equal(result.rows[0].revision, 2);
            assert.equal(result.rows[0].author_id, sam.id);
            assert.equal(result.rows[0].updated_by, taylor.id);
            assert.equal((await db.query("select count(*)::int as n from public.documents")).rows[0].n, 1);
        });

        await t.test("a stale save cannot overwrite a teammate's newer revision", async () => {
            const result = await asUser(db, sam.id, `
                update public.documents set title='Old copy' where id=$1 and revision=1 returning id
            `, [document.id]);
            assert.equal(result.rows.length, 0);
            assert.equal((await db.query("select title from public.documents where id=$1", [document.id])).rows[0].title,
                "Updated mounting notes");
        });

        await t.test("another team cannot read or update this team's documents", async () => {
            assert.equal((await asUser(db, outsider.id, "select * from public.documents")).rows.length, 0);
            assert.equal((await asUser(db, outsider.id, "update public.documents set title='Wrong team' where id=$1 returning id",
                [document.id])).rows.length, 0);
            await assert.rejects(asUser(db, outsider.id,
                "insert into public.documents(team_id,title) values ($1,'Wrong team')", [mainTeam]), { code: "42501" });
        });

        await t.test("logged-out and unassigned users have no document access", async () => {
            await assert.rejects(asUser(db, null, "select * from public.documents"), { code: "42501" });
            assert.equal((await asUser(db, unassigned.id, "select * from public.documents")).rows.length, 0);
            await assert.rejects(asUser(db, unassigned.id,
                "insert into public.documents(team_id,title) values ($1,'No membership')", [mainTeam]), { code: "42501" });
        });

        await t.test("members cannot enroll themselves, move teams, or delete documents", async () => {
            await assert.rejects(asUser(db, unassigned.id,
                "insert into public.team_members(user_id,team_id,display_name) values ($1,$2,'Intruder')",
                [unassigned.id, mainTeam]), { code: "42501" });
            await assert.rejects(asUser(db, sam.id, "update public.team_members set team_id=$1 where user_id=$2",
                [otherTeam, sam.id]), { code: "42501" });
            await assert.rejects(asUser(db, sam.id, "delete from public.documents where id=$1", [document.id]), { code: "42501" });
        });

        await t.test("document team and author cannot be reassigned", async () => {
            await assert.rejects(asUser(db, sam.id, "update public.documents set author_id=$1 where id=$2",
                [taylor.id, document.id]), { code: "42501" });
            await assert.rejects(asUser(db, sam.id, "update public.documents set team_id=$1 where id=$2",
                [otherTeam, document.id]), { code: "42501" });
        });

        await t.test("malformed content and duplicate creates fail without replacing work", async () => {
            await assert.rejects(asUser(db, sam.id,
                "insert into public.documents(team_id,title,content) values ($1,'Bad content','{}'::jsonb)", [mainTeam]),
                { code: "23514" });
            await assert.rejects(asUser(db, sam.id,
                "insert into public.documents(id,team_id,title) values ($1,$2,'Duplicate')", [document.id, mainTeam]),
                { code: "23505" });
        });

        await t.test("setup can be rerun without erasing saved work", async () => {
            await db.exec(readFileSync(resolve(__dirname, "../supabase/setup.sql"), "utf8"));
            const result = await asUser(db, taylor.id, "select * from public.documents where id=$1", [document.id]);
            assert.deepEqual(result.rows[0].content, content);
            assert.equal(result.rows[0].revision, 2);
        });
    } finally { await db.close(); }
});
