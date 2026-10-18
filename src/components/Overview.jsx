// Dashboard: task filters, timeline, progress counts, latest entries, and calendar.
import { useState } from "react";
import TaskCalendar from "./TaskCalendar";

export const byDue = (first, second) =>
  (first.data.due || "9999").localeCompare(second.data.due || "9999");
export const dueLabel = (value) =>
  value
    ? new Date(value + "T12:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "No date";
export const isOverdue = (task) =>
  task.data.due &&
  task.data.status !== "Done" &&
  new Date(task.data.due + "T23:59:59") < new Date();
export const nameFor = (members, id) =>
  members.find((person) => person.user_id === id)?.display_name || "Unassigned";

export function AssigneeOptions({ members }) {
  return (
    <>
      <option value="all">Everyone</option>
      <option value="">Unassigned</option>
      {members.map((person) => (
        <option value={person.user_id} key={person.user_id}>
          {person.display_name}
        </option>
      ))}
    </>
  );
}

export default function Overview({
  management,
  documents,
  notebookActions,
  hidden,
}) {
  const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState("active");
  const [selectedDay, setSelectedDay] = useState("");
  const tasks = management.items.filter((item) => item.kind === "task");
  const active = tasks.filter(
    (task) => !task.archived && task.data.status !== "Done",
  );
  const entries = documents.filter((item) => !item.archived);
  const visible = tasks
    .filter(
      (item) =>
        (!selectedDay || item.data.due === selectedDay) &&
        (status === "archived" ? item.archived : !item.archived) &&
        (assignee === "all" || item.data.assignee === assignee) &&
        (status === "active"
          ? item.data.status !== "Done"
          : status === "Done"
            ? item.data.status === "Done"
            : true),
    )
    .sort(byDue);
  return (
    <section
      className="section overview"
      id="overview"
      hidden={hidden}
      aria-labelledby="overview-title"
    >
      <div className="section-heading">
        <div>
          <h1 id="overview-title">Overview</h1>
        </div>
        <button
          className="notebook-button primary"
          data-new="task"
          hidden={!management.isManager}
          disabled={!management.ready || management.busy}
          onClick={() => management.open("task")}
        >
          + Add task
        </button>
      </div>
      <div className="stats" aria-label="Team progress">
        <div>
          <span>OPEN TASKS</span>
          <strong id="stat-open">
            {management.member ? active.length : "—"}
          </strong>
        </div>
        <div>
          <span>IN PROGRESS</span>
          <strong id="stat-progress">
            {management.member
              ? active.filter((task) => task.data.status === "In progress")
                  .length
              : "—"}
          </strong>
        </div>
        <div>
          <span>DOCUMENTED</span>
          <strong id="stat-documents">
            {management.member ? entries.length : "—"}
          </strong>
        </div>
      </div>
      <section className="panel timeline">
        <div className="panel-heading">
          <div>
            <h2>Current timeline</h2>
          </div>
          <button
            id="refresh-management"
            className="text-button"
            disabled={!management.member || management.busy}
            onClick={management.refresh}
          >
            ↻ Refresh
          </button>
        </div>
        <div className="filter-row">
          <label>
            Assigned to
            <select
              id="task-assignee-filter"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <AssigneeOptions members={management.members} />
            </select>
          </label>
          <label>
            Show
            <select
              id="task-status-filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Active tasks</option>
              <option value="all">All tasks</option>
              <option value="Done">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          id="clear-calendar-day"
          className="text-button"
          hidden={!selectedDay}
          onClick={() => setSelectedDay("")}
        >
          {selectedDay
            ? "Showing " + dueLabel(selectedDay) + " · Show all dates ×"
            : "Show all dates"}
        </button>
        <div className="table-scroll">
          <table className="task-table">
            <thead>
              <tr>
                <th scope="col">Task / mechanism</th>
                <th scope="col">Assigned to</th>
                <th scope="col">Due</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody id="task-table-body">
              {visible.map((task) => (
                <tr key={task.id}>
                  <td>
                    <strong>{task.title}</strong>
                    <small>{task.data.mechanism || "General"}</small>
                  </td>
                  <td>{nameFor(management.members, task.data.assignee)}</td>
                  <td className={isOverdue(task) ? "overdue" : ""}>
                    {dueLabel(task.data.due)}
                  </td>
                  <td>
                    <span
                      className={
                        "status-pill " +
                        (task.data.status === "Done"
                          ? "done"
                          : task.data.status === "In progress"
                            ? "progress"
                            : "todo")
                      }
                    >
                      {task.archived ? "Archived" : task.data.status}
                    </span>
                  </td>
                  <td>
                    {management.canEditTask(task) && (
                      <button
                        type="button"
                        className="text-button"
                        aria-label={"Edit " + task.title}
                        onClick={() => management.open("task", task)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p id="task-empty" className="empty-state" hidden={visible.length > 0}>
          {management.member
            ? "No tasks match this view. Try changing the filters."
            : "Sign in to see your team's plan."}
        </p>
      </section>
      <div className="overview-bottom">
        <section className="panel">
          <div className="panel-heading">
            <h2>Latest entries</h2>
            <a href="#documenting">Open notebook ↗</a>
          </div>
          <div id="recent-documents" className="entry-list">
            {entries.slice(0, 3).map((item) => (
              <button
                type="button"
                key={item.id}
                className="recent-entry"
                onClick={() => notebookActions.openEntry({ detail: item.id })}
              >
                <span className="entry-symbol">≡</span>
                <strong>{item.title}</strong>
                <small>
                  {item.mechanism} ·{" "}
                  {new Date(item.updated_at).toLocaleDateString()}
                </small>
              </button>
            ))}
            {!entries.length && (
              <p className="empty-state">
                Your design decisions will appear here.
              </p>
            )}
          </div>
          <button
            className="text-button"
            data-start-entry
            disabled={!management.member}
            onClick={notebookActions.newEntry}
          >
            Write a design entry ↗
          </button>
        </section>
        <TaskCalendar
          tasks={tasks}
          selectedDay={selectedDay}
          onSelect={setSelectedDay}
        />
      </div>
    </section>
  );
}
