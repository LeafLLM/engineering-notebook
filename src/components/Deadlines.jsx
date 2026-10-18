// Upcoming tasks and the team roster in the right-hand sidebar.
import { useState } from "react";
import TeamAccess from "./TeamAccess";
import {
  AssigneeOptions,
  byDue,
  dueLabel,
  isOverdue,
  nameFor,
} from "./Overview";

export default function Deadlines({ management, notebookActions }) {
  const [assignee, setAssignee] = useState("all");
  const upcoming = management.items
    .filter(
      (task) =>
        task.kind === "task" &&
        !task.archived &&
        task.data.status !== "Done" &&
        task.data.due &&
        (assignee === "all" || task.data.assignee === assignee),
    )
    .sort(byDue);
  return (
    <aside className="deadlines" id="deadlines" aria-label="Upcoming deadlines">
      <div className="panel-heading">
        <h2>Upcoming</h2>
        <span className="tiny-label">DEADLINES</span>
      </div>
      <label className="rail-filter">
        Assigned to
        <select
          id="deadline-assignee"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        >
          <AssigneeOptions members={management.members} />
        </select>
      </label>
      <div id="deadline-list">
        {upcoming.slice(0, 5).map((task) => (
          <button
            type="button"
            className="deadline-item"
            key={task.id}
            disabled={!management.canEditTask(task)}
            onClick={() => management.open("task", task)}
          >
            <span className={isOverdue(task) ? "overdue" : "deadline-date"}>
              {isOverdue(task) ? "OVERDUE · " : ""}
              {dueLabel(task.data.due)}
            </span>
            <strong>{task.title}</strong>
            <small>{nameFor(management.members, task.data.assignee)}</small>
          </button>
        ))}
        {!upcoming.length && (
          <p className="empty-state">
            {management.member
              ? "No deadlines in this view. Room to focus."
              : "Sign in to see upcoming tasks."}
          </p>
        )}
      </div>
      <div className="rail-team">
        <p className="eyebrow">YOUR CAD TEAM</p>
        <div id="team-roster">
          {management.members.map((person) => (
            <div className="roster-person" key={person.user_id}>
              <span className="member-avatar">
                {person.display_name.slice(0, 1)}
              </span>
              <span>{person.display_name}</span>
            </div>
          ))}
        </div>
        <TeamAccess management={management} notebookActions={notebookActions} />
      </div>
    </aside>
  );
}
