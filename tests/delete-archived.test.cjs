const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createTestDatabase, asUser, users } = require("./fixtures.cjs");

test("permanent deletion is limited to authorized archived records and current revisions", async () => {
  const { db, mainTeam } = await createTestDatabase();
  const [manager, member, foreign] = users;
  const migration = readFileSync(
    resolve(__dirname, "../supabase/delete-archived.sql"),
    "utf8",
  );
  const remove = (user, table, item, revision = item.revision) =>
    asUser(
      db,
      user,
      `delete from public.${table} where id=$1 and revision=$2 and archived=true returning id`,
      [item.id, revision],
    );
  try {
    await db.exec(migration);
    await db.exec(migration); // Safe to rerun.
    const own = (
      await asUser(
        db,
        member.id,
        "insert into documents(team_id,title) values ($1,'Member entry') returning *",
        [mainTeam],
      )
    ).rows[0];
    // Even an unfiltered DELETE cannot remove an active document.
    assert.equal(
      (
        await asUser(
          db,
          manager.id,
          "delete from documents where id=$1 returning id",
          [own.id],
        )
      ).rows.length,
      0,
    );
    const archived = (
      await asUser(
        db,
        member.id,
        "update documents set archived=true where id=$1 returning *",
        [own.id],
      )
    ).rows[0];
    await assert.rejects(remove(null, "documents", archived), {
      code: "42501",
    });
    assert.equal(
      (await remove(foreign.id, "documents", archived)).rows.length,
      0,
    );
    assert.equal(
      (await remove(member.id, "documents", archived, own.revision)).rows
        .length,
      0,
    );
    await asUser(
      db,
      member.id,
      "update documents set archived=false where id=$1",
      [own.id],
    );
    assert.equal(
      (await remove(member.id, "documents", archived)).rows.length,
      0,
    );
    const rearchived = (
      await asUser(
        db,
        member.id,
        "update documents set archived=true where id=$1 returning *",
        [own.id],
      )
    ).rows[0];
    assert.equal(
      (await remove(member.id, "documents", rearchived)).rows.length,
      1,
    );

    const managersEntry = (
      await asUser(
        db,
        manager.id,
        "insert into documents(team_id,title) values ($1,'Manager entry') returning *",
        [mainTeam],
      )
    ).rows[0];
    const managerArchive = (
      await asUser(
        db,
        manager.id,
        "update documents set archived=true where id=$1 returning *",
        [managersEntry.id],
      )
    ).rows[0];
    assert.equal(
      (await remove(member.id, "documents", managerArchive)).rows.length,
      0,
    );
    assert.equal(
      (await remove(manager.id, "documents", managerArchive)).rows.length,
      1,
    );

    const resource = (
      await asUser(
        db,
        member.id,
        "insert into team_items(team_id,kind,title,archived) values ($1,'resource','Member resource',true) returning *",
        [mainTeam],
      )
    ).rows[0];
    assert.equal(
      (await remove(foreign.id, "team_items", resource)).rows.length,
      0,
    );
    assert.equal(
      (await remove(member.id, "team_items", resource)).rows.length,
      1,
    );
    const managerResource = (
      await asUser(
        db,
        manager.id,
        "insert into team_items(team_id,kind,title,archived) values ($1,'resource','Manager resource',true) returning *",
        [mainTeam],
      )
    ).rows[0];
    assert.equal(
      (await remove(member.id, "team_items", managerResource)).rows.length,
      0,
    );
    assert.equal(
      (await remove(manager.id, "team_items", managerResource)).rows.length,
      1,
    );
    for (const assignee of [member.id, manager.id]) {
      const task = (
        await asUser(
          db,
          manager.id,
          "insert into team_items(team_id,kind,title,data,archived) values ($1,'task','Archived task',$2,true) returning *",
          [mainTeam, JSON.stringify({ assignee, status: "To do" })],
        )
      ).rows[0];
      assert.equal(
        (await remove(member.id, "team_items", task)).rows.length,
        assignee === member.id ? 1 : 0,
      );
      if (assignee === manager.id)
        assert.equal(
          (await remove(manager.id, "team_items", task)).rows.length,
          1,
        );
    }
    const activeResource = (
      await asUser(
        db,
        manager.id,
        "insert into team_items(team_id,kind,title) values ($1,'resource','Active resource') returning *",
        [mainTeam],
      )
    ).rows[0];
    assert.equal(
      (
        await asUser(
          db,
          manager.id,
          "delete from team_items where id=$1 returning id",
          [activeResource.id],
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
