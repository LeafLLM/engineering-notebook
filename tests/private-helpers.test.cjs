const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createTestDatabase, asUser, users } = require('./fixtures.cjs');

test('private permission helpers preserve access without public RPC functions', async () => {
    const { db, mainTeam } = await createTestDatabase();
    const [manager, member, outsider, unassigned] = users;
    const migration = readFileSync(join(__dirname, '../supabase/private-permission-helpers.sql'), 'utf8');
    try {
        const entry = (await asUser(db, member.id,
            "insert into documents(team_id,title) values ($1,'Preserve me') returning *", [mainTeam])).rows[0];
        await db.exec(migration);
        await db.exec(migration);
        const endpoints = (await db.query("select to_regprocedure('public.current_team_id()') as team, to_regprocedure('public.is_team_manager()') as manager")).rows[0];
        assert.deepEqual(endpoints, { team: null, manager: null });
        assert.equal((await asUser(db, manager.id, 'select private.is_team_manager() as manager')).rows[0].manager, true);
        assert.equal((await asUser(db, member.id, 'select private.is_team_manager() as manager')).rows[0].manager, false);
        assert.equal((await asUser(db, unassigned.id, 'select private.current_team_id() as team')).rows[0].team, null);
        await assert.rejects(asUser(db, null, 'select private.current_team_id()'), { code: '42501' });
        const data = JSON.stringify({ assignee: member.id, status: 'To do' });
        const task = (await asUser(db, manager.id,
            "insert into team_items(team_id,kind,title,data) values ($1,'task','Assigned',$2) returning *", [mainTeam, data])).rows[0];
        assert.equal((await asUser(db, member.id, 'select * from team_members')).rows.length, 2);
        assert.equal((await asUser(db, outsider.id, 'select * from team_items')).rows.length, 0);
        await assert.rejects(asUser(db, member.id,
            "insert into team_items(team_id,kind,title,data) values ($1,'task','Blocked',$2)", [mainTeam, data]), { code: '42501' });
        await assert.rejects(asUser(db, member.id,
            "update team_items set data=jsonb_set(data,'{assignee}',to_jsonb($2::text)) where id=$1", [task.id, manager.id]), { code: '42501' });
        assert.equal((await asUser(db, member.id,
            'update team_items set archived=true where id=$1 returning archived', [task.id])).rows[0].archived, true);
        await asUser(db, member.id, 'update documents set archived=true where id=$1', [entry.id]);
        await assert.rejects(asUser(db, member.id,
            "update documents set title='Blocked' where id=$1", [entry.id]), { code: '42501' });
        assert.equal((await asUser(db, manager.id,
            'update documents set archived=false where id=$1 returning title', [entry.id])).rows[0].title, 'Preserve me');
        await asUser(db, manager.id,
            "update team_items set data=jsonb_set(data,'{assignee}',to_jsonb($2::text)) where id=$1", [task.id, manager.id]);
        assert.equal((await asUser(db, member.id,
            "update team_items set title='Blocked' where id=$1 returning id", [task.id])).rows.length, 0);
    } finally { await db.close(); }
});
