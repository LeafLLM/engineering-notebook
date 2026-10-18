// Shared task/resource form. Keeps unsaved fields local until Save succeeds.
import { useEffect, useRef, useState } from "react";

export default function ItemDialog({ management }) {
  const item = management.editing;
  const dialog = useRef(null);
  // Form edits stay here, so a failed request leaves everything the user typed intact.
  const [fields, setFields] = useState(() => ({
    title: item.title || "",
    mechanism: item.data.mechanism || "",
    assignee: item.data.assignee || "",
    due: item.data.due || "",
    status: item.data.status || "To do",
    category: item.data.category || "Part",
    url: item.data.url || "",
    notes: item.data.notes || "",
  }));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  useEffect(() => {
    const unload = (event) => {
      if (dirty || management.busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty, management.busy]);
  const change = (field) => (event) => {
    setFields((fields) => ({ ...fields, [field]: event.target.value }));
    setDirty(true);
  };
  function close() {
    if (
      !management.busy &&
      (!dirty || confirm("Discard the unsaved changes in this form?"))
    )
      management.close();
  }
  function submit(event) {
    event.preventDefault();
    const title = fields.title.trim();
    if (!title) {
      management.setFormError("Give this item a title.");
      return;
    }
    const data = { notes: fields.notes.trim() };
    if (item.kind === "task")
      Object.assign(data, {
        mechanism: fields.mechanism.trim() || "General",
        assignee: management.isManager ? fields.assignee : item.data.assignee,
        due: fields.due,
        status: fields.status,
      });
    else {
      data.category = fields.category;
      data.url = fields.url.trim();
      if (data.url && !/^https?:\/\//i.test(data.url)) {
        management.setFormError(
          "Use a link beginning with https:// or http://.",
        );
        return;
      }
    }
    management.save({ ...item, title, data });
  }
  return (
    <dialog
      ref={dialog}
      id="item-dialog"
      aria-labelledby="item-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <form id="item-form" onSubmit={submit}>
        <div className="panel-heading">
          <h2 id="item-dialog-title">
            {item.revision ? "Edit" : "Add"} {item.kind}
          </h2>
          <button
            type="button"
            className="icon-button"
            id="close-item-dialog"
            aria-label="Close form"
            disabled={management.busy}
            onClick={close}
          >
            ×
          </button>
        </div>
        <label>
          Title
          <input
            name="title"
            id="item-title"
            maxLength="160"
            required
            autoFocus
            disabled={management.busy}
            value={fields.title}
            onChange={change("title")}
          />
        </label>
        <fieldset
          id="task-fields"
          hidden={item.kind !== "task"}
          disabled={management.busy || item.kind !== "task"}
        >
          <legend className="visually-hidden">Task details</legend>
          <label>
            Mechanism
            <input
              id="item-mechanism"
              maxLength="100"
              placeholder="General"
              value={fields.mechanism}
              onChange={change("mechanism")}
            />
          </label>
          <div className="form-pair">
            <label id="task-assignment-field" hidden={!management.isManager}>
              Assigned to
              <select
                id="item-assignee"
                value={fields.assignee}
                onChange={change("assignee")}
              >
                <option value="">Unassigned</option>
                {management.members.map((person) => (
                  <option key={person.user_id} value={person.user_id}>
                    {person.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input
                type="date"
                id="item-due"
                value={fields.due}
                onChange={change("due")}
              />
            </label>
          </div>
          <label>
            Status
            <select
              id="item-status"
              value={fields.status}
              onChange={change("status")}
            >
              <option>To do</option>
              <option>In progress</option>
              <option>Done</option>
            </select>
          </label>
        </fieldset>
        <fieldset
          id="resource-fields"
          hidden={item.kind !== "resource"}
          disabled={management.busy || item.kind !== "resource"}
        >
          <legend className="visually-hidden">Resource details</legend>
          <label>
            Category
            <select
              id="item-category"
              value={fields.category}
              onChange={change("category")}
            >
              <option>Part</option>
              <option>Reference</option>
              <option>Tip</option>
            </select>
          </label>
          <label>
            Link (optional)
            <input
              type="url"
              id="item-url"
              placeholder="https://…"
              maxLength="2000"
              value={fields.url}
              onChange={change("url")}
            />
          </label>
        </fieldset>
        <label>
          Notes
          <textarea
            id="item-notes"
            rows="4"
            maxLength="10000"
            placeholder="What should your teammate know?"
            disabled={management.busy}
            value={fields.notes}
            onChange={change("notes")}
          />
        </label>
        <p id="item-error" role="alert">
          {management.formError}
        </p>
        <div className="dialog-actions">
          {management.canDelete(item) && (
            <button
              type="button"
              id="delete-item"
              className="text-button danger"
              disabled={management.busy}
              onClick={management.remove}
            >
              Delete permanently
            </button>
          )}
          <button
            type="button"
            id="archive-item"
            className="text-button"
            hidden={!item.revision}
            disabled={management.busy}
            onClick={() => {
              if (dirty)
                management.setFormError(
                  "Save your edits before archiving or restoring this item.",
                );
              else management.save({ ...item, archived: !item.archived });
            }}
          >
            {item.archived ? "Restore" : "Archive"}
          </button>
          <button
            type="button"
            className="notebook-button"
            id="cancel-item"
            disabled={management.busy}
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="notebook-button primary"
            id="save-item"
            disabled={management.busy}
          >
            Save {item.kind}
          </button>
        </div>
      </form>
    </dialog>
  );
}
