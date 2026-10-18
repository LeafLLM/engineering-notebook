// An isolated, disposable workspace. This client never sends network requests.
export function createDemoClient() {
  const user = { id: "demo-alex", email: "alex@example.test" };
  const teamId = "demo-team";
  const today = new Date();
  const date = (offset) => {
    const day = new Date(today);
    day.setDate(day.getDate() + offset);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  };
  const stamp = () => new Date().toISOString();
  const record = (id, values) => ({
    id,
    team_id: teamId,
    author_id: user.id,
    updated_by: user.id,
    created_at: stamp(),
    updated_at: stamp(),
    revision: 1,
    archived: false,
    ...values,
  });
  const document = (id, title, mechanism, text) =>
    record(id, {
      title,
      mechanism,
      content: { ops: [{ insert: text + "\n" }] },
    });
  const tables = {
    teams: [{ id: teamId, name: "Demo robotics team" }],
    team_members: [
      {
        user_id: user.id,
        team_id: teamId,
        display_name: "Alex",
        role: "manager",
      },
      {
        user_id: "demo-jordan",
        team_id: teamId,
        display_name: "Jordan",
        role: "member",
      },
      {
        user_id: "demo-riley",
        team_id: teamId,
        display_name: "Riley",
        role: "manager",
      },
    ],
    documents: [
      document(
        "demo-intake",
        "Intake roller test",
        "Intake",
        "We tested two roller spacings with the same game piece. The narrower spacing held the piece more consistently, but drew more current. Next: repeat the test with a softer roller.",
      ),
      document(
        "demo-drive",
        "Drivetrain clearance",
        "Drivetrain",
        "The first chassis mockup left too little space around the belt guard. We moved the mount outward by 3 mm and checked the wheel travel in CAD. Next: print a small fit sample before machining the bracket.",
      ),
      document(
        "demo-wiring",
        "Cable routing plan",
        "Electronics",
        "Keep sensor wires clear of the intake pivot. Label both ends of each cable and leave a service loop near the controller. Review the routing with the mechanical team before cutting wire.",
      ),
    ],
    team_items: [
      record("demo-task-intake", {
        kind: "task",
        title: "Test intake roller spacing",
        data: {
          mechanism: "Intake",
          assignee: user.id,
          due: date(1),
          status: "In progress",
          notes: "Compare grip and motor current across five runs.",
        },
      }),
      record("demo-task-drive", {
        kind: "task",
        title: "Print bracket fit sample",
        data: {
          mechanism: "Drivetrain",
          assignee: "demo-jordan",
          due: date(3),
          status: "To do",
          notes: "Check belt guard clearance before machining.",
        },
      }),
      record("demo-task-wiring", {
        kind: "task",
        title: "Review cable routing",
        data: {
          mechanism: "Electronics",
          assignee: "demo-riley",
          due: date(5),
          status: "To do",
          notes: "Check clearance through the full pivot travel.",
        },
      }),
      record("demo-task-done", {
        kind: "task",
        title: "Measure chassis mounting holes",
        data: {
          mechanism: "Drivetrain",
          assignee: user.id,
          due: date(-1),
          status: "Done",
          notes: "Measurements recorded in the CAD model.",
        },
      }),
      record("demo-resource-checklist", {
        kind: "resource",
        title: "Pre-test checklist",
        data: {
          category: "Tip",
          url: "",
          notes:
            "Check fasteners, battery charge, cable clearance, and the emergency stop before each test.",
        },
      }),
      record("demo-resource-bearing", {
        kind: "resource",
        title: "Intake bearing notes",
        data: {
          category: "Part",
          url: "",
          notes:
            "Check shaft diameter and bearing seat tolerance with a small fit sample.",
        },
      }),
      record("demo-resource-cad", {
        kind: "resource",
        title: "CAD review checklist",
        data: {
          category: "Reference",
          url: "",
          notes:
            "Review clearances, tool access, assembly order, and drawing dimensions.",
        },
      }),
    ],
  };

  function from(table) {
    const filters = [];
    let operation = "select",
      values,
      sort;
    let executed;
    const query = {
      select() {
        return query;
      },
      eq(key, value) {
        filters.push((row) => row[key] === value);
        return query;
      },
      order(key, options) {
        sort = { key, ascending: options?.ascending !== false };
        return query;
      },
      insert(value) {
        operation = "insert";
        values = value;
        return query;
      },
      update(value) {
        operation = "update";
        values = value;
        return query;
      },
      delete() {
        operation = "delete";
        return query;
      },
      single() {
        return run(true);
      },
      maybeSingle() {
        return run(true);
      },
      then(resolve, reject) {
        return run(false).then(resolve, reject);
      },
    };
    function run(single) {
      if (executed) return executed;
      executed = Promise.resolve().then(() => {
        if (!tables[table])
          return { data: null, error: { message: "Unavailable in the demo." } };
        let rows = tables[table].filter((row) =>
          filters.every((matches) => matches(row)),
        );
        if (
          operation !== "select" &&
          !["documents", "team_items"].includes(table)
        )
          return {
            data: null,
            error: { message: "Team access is unavailable in the demo." },
          };
        if (operation === "insert") {
          rows = [
            record(values.id || crypto.randomUUID(), structuredClone(values)),
          ];
          tables[table].push(...rows);
        } else if (operation === "update") {
          rows.forEach((row) =>
            Object.assign(row, structuredClone(values), {
              revision: row.revision + 1,
              updated_at: stamp(),
              updated_by: user.id,
            }),
          );
        } else if (operation === "delete") {
          tables[table] = tables[table].filter((row) => !rows.includes(row));
        }
        if (sort)
          rows.sort(
            (a, b) =>
              String(a[sort.key]).localeCompare(String(b[sort.key])) *
              (sort.ascending ? 1 : -1),
          );
        return {
          data: structuredClone(single ? rows[0] || null : rows),
          error: null,
        };
      });
      return executed;
    }
    return query;
  }
  return {
    from,
    auth: {
      async getSession() {
        return { data: { session: { user } }, error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    async rpc() {
      return {
        data: null,
        error: { message: "Team access is unavailable in the demo." },
      };
    },
  };
}
