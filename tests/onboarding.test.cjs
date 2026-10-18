const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestDatabase, asUser, users } = require("./fixtures.cjs");

test("team onboarding enforces identity, isolation and atomic creation", async () => {
  const { db, mainTeam } = await createTestDatabase();
  const newcomer = users[3].id;
  const create = (user, name, member = "New manager") =>
    asUser(db, user, "select public.create_team($1,$2) as id", [name, member]);
  try {
    await assert.rejects(create(null, "Anonymous team"), { code: "42501" });
    await assert.rejects(create(users[1].id, "Extra team"), { code: "42501" });
    await assert.rejects(create(newcomer, "   "), { code: "22023" });
    await assert.rejects(create(newcomer, "New team", " "), { code: "22023" });
    await assert.rejects(create(newcomer, "X".repeat(101)), { code: "22023" });
    await assert.rejects(create(newcomer, " engineering TEAM "), {
      code: "23505",
    });
    await assert.rejects(
      asUser(
        db,
        newcomer,
        "insert into public.team_members(user_id,team_id,display_name,role) values ($1,$2,'Me','manager')",
        [newcomer, mainTeam],
      ),
      { code: "42501" },
    );

    // Force membership insertion to fail: the team insert must roll back too.
    await db.exec(`create function public.reject_test_membership() returns trigger language plpgsql as $$
      begin raise exception 'Temporary test failure'; end $$;
      create trigger reject_test_membership before insert on public.team_members
      for each row execute function public.reject_test_membership();`);
    await assert.rejects(create(newcomer, "Rollback team"));
    assert.equal(
      (await db.query("select id from teams where name='Rollback team'")).rows
        .length,
      0,
    );
    await db.exec("drop trigger reject_test_membership on public.team_members");

    const id = (await create(newcomer, " New robotics team ", " Alex ")).rows[0]
      .id;
    const member = (
      await asUser(db, newcomer, "select * from public.team_members")
    ).rows[0];
    assert.equal(member.user_id, newcomer);
    assert.equal(member.team_id, id);
    assert.equal(member.role, "manager");
    assert.equal(member.display_name, "Alex");
    assert.equal(
      (await asUser(db, newcomer, "select * from teams")).rows.length,
      1,
    );
    await assert.rejects(create(newcomer, "Second team"), { code: "42501" });
    assert.equal(
      (await db.query("select id from teams where name='Second team'")).rows
        .length,
      0,
    );
  } finally {
    await db.close();
  }
});
