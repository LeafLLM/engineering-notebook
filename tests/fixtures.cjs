// Disposable test accounts and an in-memory PostgreSQL database. Never production.
const { PGlite } = require("@electric-sql/pglite");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const users = [
    { id: "10000000-0000-4000-8000-000000000001", email: "sam@example.test", name: "Sam" },
    { id: "10000000-0000-4000-8000-000000000002", email: "taylor@example.test", name: "Taylor" },
    { id: "10000000-0000-4000-8000-000000000003", email: "other@example.test", name: "Other team" },
    { id: "10000000-0000-4000-8000-000000000004", email: "unassigned@example.test", name: "Unassigned" }
];

async function createTestDatabase() {
    const db = await PGlite.create();
    await db.exec(`
        create role anon noinherit;
        create role authenticated noinherit;
        create schema auth;
        create table auth.users(id uuid primary key, email text unique);
        create function auth.uid() returns uuid language sql stable as $$
            select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$;
        grant usage on schema auth to anon, authenticated;
    `);
    await db.exec(readFileSync(resolve(__dirname, "../supabase/setup.sql"), "utf8"));
    await db.exec(readFileSync(resolve(__dirname, "../supabase/management.sql"), "utf8"));
    await db.exec(readFileSync(resolve(__dirname, "../supabase/roles-and-archives.sql"), "utf8"));
    for (const user of users) {
        await db.query("insert into auth.users(id,email) values ($1,$2)", [user.id, user.email]);
    }
    const mainTeam = (await db.query("select id from public.teams where name = 'Engineering team'")).rows[0].id;
    const otherTeam = (await db.query("insert into public.teams(name) values ('Other test team') returning id")).rows[0].id;
    for (const [index, teamId] of [[0, mainTeam], [1, mainTeam], [2, otherTeam]]) {
        await db.query("insert into public.team_members(user_id,team_id,display_name) values ($1,$2,$3)",
            [users[index].id, teamId, users[index].name]);
    }
    await db.query("update public.team_members set role = 'manager' where user_id=$1", [users[0].id]);
    return { db, mainTeam, otherTeam };
}

async function asUser(db, userId, sql, params = []) {
    return db.transaction(async tx => {
        await tx.exec(userId ? "set local role authenticated" : "set local role anon");
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId || ""]);
        return tx.query(sql, params);
    });
}

module.exports = { users, createTestDatabase, asUser };
