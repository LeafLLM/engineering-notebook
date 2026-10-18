const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { users, asUser, createTestDatabase } = require("./fixtures.cjs");

test("invites bind verified email, expire, revoke and join atomically without moving accounts", async () => {
  const { db, mainTeam } = await createTestDatabase();
  const [manager, member, outsider, newcomer] = users;
  const migrate = readFileSync(
    resolve(__dirname, "../supabase/team-invitations.sql"),
    "utf8",
  );
  const invite = async (email, role = "member", caller = manager.id) =>
    (
      await asUser(db, caller, "select create_team_invite($1,$2) as token", [
        email,
        role,
      ])
    ).rows[0].token;
  const accept = (token, caller = newcomer.id) =>
    asUser(db, caller, "select accept_team_invite($1,'New teammate') as team", [
      token,
    ]);
  try {
    await db.exec(migrate);
    await db.exec(migrate);
    await assert.rejects(invite(newcomer.email, "member", null), {
      code: "42501",
    });
    await assert.rejects(invite(newcomer.email, "member", member.id), {
      code: "42501",
    });
    await assert.rejects(invite("not-email"), { code: "22023" });
    await assert.rejects(invite(newcomer.email, "owner"), { code: "22023" });
    const expired = await invite(newcomer.email);
    await db.query(
      "update team_invites set expires_at=now()-interval '1 second' where token=$1",
      [expired],
    );
    await assert.rejects(accept(expired), { code: "22023" });
    const revoked = await invite(newcomer.email);
    const id = (
      await db.query("select id from team_invites where token=$1", [revoked])
    ).rows[0].id;
    await assert.rejects(
      asUser(db, member.id, "select revoke_team_invite($1)", [id]),
      { code: "42501" },
    );
    await asUser(db, manager.id, "select revoke_team_invite($1)", [id]);
    await assert.rejects(accept(revoked), { code: "22023" });
    const replaced = await invite(newcomer.email);
    const token = await invite(" UNASSIGNED@EXAMPLE.TEST ");
    await assert.rejects(accept(replaced), { code: "22023" });
    await assert.rejects(accept(token, null), { code: "42501" });
    await assert.rejects(accept(token, outsider.id), { code: "42501" });
    await assert.rejects(accept("00000000-0000-4000-8000-000000000000"), {
      code: "22023",
    });
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [newcomer.id],
    );
    await assert.rejects(accept(token), { code: "42501" });
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [newcomer.id],
    );
    assert.equal(
      (await asUser(db, newcomer.id, "select * from team_invites")).rows.length,
      0,
    );
    assert.equal(
      (await asUser(db, member.id, "select * from team_invites")).rows.length,
      0,
    );
    assert.equal(
      (await asUser(db, outsider.id, "select * from team_invites")).rows.length,
      0,
    );
    await assert.rejects(
      asUser(
        db,
        newcomer.id,
        "insert into team_invites(team_id,email,role) values ($1,'me@example.test','manager')",
        [mainTeam],
      ),
      { code: "42501" },
    );
    // A failed membership insert must leave the invitation unused.
    await db.exec(`create function reject_invite_test() returns trigger language plpgsql as $$
      begin raise exception 'Temporary join failure'; end $$;
      create trigger reject_invite_test before insert on team_members for each row execute function reject_invite_test();`);
    await assert.rejects(accept(token));
    assert.equal(
      (
        await db.query("select accepted_at from team_invites where token=$1", [
          token,
        ])
      ).rows[0].accepted_at,
      null,
    );
    await db.exec("drop trigger reject_invite_test on team_members");
    assert.equal((await accept(token)).rows[0].team, mainTeam);
    assert.equal((await accept(token)).rows[0].team, mainTeam); // Lost-response retry.
    const joined = (
      await db.query("select * from team_members where user_id=$1", [
        newcomer.id,
      ])
    ).rows[0];
    assert.equal(joined.role, "member");
    assert.equal(joined.display_name, "New teammate");
    assert.ok(
      (
        await db.query("select accepted_at from team_invites where token=$1", [
          token,
        ])
      ).rows[0].accepted_at,
    );

    const foreignToken = await invite(outsider.email, "manager");
    await assert.rejects(accept(foreignToken, outsider.id), { code: "42501" });
    assert.notEqual(
      (
        await db.query("select team_id from team_members where user_id=$1", [
          outsider.id,
        ])
      ).rows[0].team_id,
      mainTeam,
    );
    // Invites issued by someone who is no longer a manager cannot grant access.
    const late = "10000000-0000-4000-8000-000000000090";
    await db.query(
      "insert into auth.users(id,email) values ($1,'late@example.test')",
      [late],
    );
    const lateToken = await invite("late@example.test", "manager");
    await db.query("update team_members set role='member' where user_id=$1", [
      manager.id,
    ]);
    await assert.rejects(accept(lateToken, late), { code: "22023" });
  } finally {
    await db.close();
  }
});

test("removing membership revokes access and pending invites while preserving the account and team data", async () => {
  const { db, mainTeam } = await createTestDatabase();
  const [manager, member, outsider] = users;
  const remove = (caller, target, expected = "member") =>
    asUser(db, caller, "select remove_team_member($1,$2)", [target, expected]);
  try {
    await db.exec(
      readFileSync(
        resolve(__dirname, "../supabase/team-invitations.sql"),
        "utf8",
      ),
    );
    const entry = (
      await asUser(
        db,
        member.id,
        "insert into documents(team_id,title) values ($1,'Keep team writing') returning id",
        [mainTeam],
      )
    ).rows[0].id;
    const invite = (
      await asUser(
        db,
        manager.id,
        "select create_team_invite($1,'member') as token",
        [member.email],
      )
    ).rows[0].token;
    await assert.rejects(remove(null, member.id), { code: "42501" });
    await assert.rejects(remove(member.id, manager.id, "manager"), {
      code: "42501",
    });
    await assert.rejects(remove(manager.id, outsider.id), { code: "42501" });
    await assert.rejects(remove(manager.id, manager.id, "manager"), {
      code: "22023",
    });
    await assert.rejects(remove(manager.id, member.id, "manager"), {
      code: "40001",
    });
    await remove(manager.id, member.id);
    assert.equal(
      (await asUser(db, member.id, "select * from documents")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select id from documents where id=$1", [entry])).rows
        .length,
      1,
    );
    assert.equal(
      (await db.query("select id from auth.users where id=$1", [member.id]))
        .rows.length,
      1,
    );
    await assert.rejects(
      asUser(db, member.id, "select accept_team_invite($1,'Rejoin')", [invite]),
      { code: "22023" },
    );
  } finally {
    await db.close();
  }
});

test("only same-team managers can change roles and the last manager is protected", async () => {
  const { db, mainTeam } = await createTestDatabase();
  const [manager, member, outsider] = users;
  const change = (caller, target, role, expected) =>
    asUser(db, caller, "select set_team_member_role($1,$2,$3)", [
      target,
      role,
      expected,
    ]);
  try {
    await db.exec(
      readFileSync(
        resolve(__dirname, "../supabase/team-invitations.sql"),
        "utf8",
      ),
    );
    await assert.rejects(change(null, member.id, "manager", "member"), {
      code: "42501",
    });
    await assert.rejects(change(member.id, member.id, "manager", "member"), {
      code: "42501",
    });
    await assert.rejects(change(manager.id, outsider.id, "manager", "member"), {
      code: "42501",
    });
    await assert.rejects(change(manager.id, member.id, "owner", "member"), {
      code: "22023",
    });
    await assert.rejects(change(manager.id, manager.id, "member", "manager"), {
      code: "22023",
    });
    await assert.rejects(
      asUser(
        db,
        manager.id,
        "update team_members set role='manager' where user_id=$1",
        [member.id],
      ),
      { code: "42501" },
    );
    await change(manager.id, member.id, "manager", "member");
    await assert.rejects(change(manager.id, member.id, "member", "member"), {
      code: "40001",
    });
    await change(manager.id, manager.id, "member", "manager");
    await assert.rejects(change(manager.id, manager.id, "manager", "member"), {
      code: "42501",
    });
    await assert.rejects(change(member.id, member.id, "member", "manager"), {
      code: "22023",
    });
    assert.equal(
      (
        await db.query(
          "select count(*)::int as count from team_members where team_id=$1 and role='manager'",
          [mainTeam],
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});
