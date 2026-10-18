// Groups saved entries by mechanism. Clicking an entry asks the notebook to open it.
export default function DocumentList({ state, actions }) {
  // Derive the visible groups from data instead of manually building HTML nodes.
  const archived = state.archiveFilter === "archived";
  const visible = state.documents.filter(
    (item) => Boolean(item.archived) === archived,
  );
  // Compare normalized names, but preserve a readable label from the entries.
  // This also groups older saved entries without rewriting their data.
  const groups = new Map();
  for (const item of visible) {
    const label = item.mechanism.trim() || "General";
    const key = label.toLowerCase();
    if (!groups.has(key)) groups.set(key, { key, label, entries: [] });
    groups.get(key).entries.push(item);
  }
  const mechanisms = [...groups.values()].sort((first, second) =>
    first.key.localeCompare(second.key),
  );
  return (
    <aside
      className="document-library"
      aria-labelledby="document-library-title"
    >
      <div className="document-library-heading">
        <h2 id="document-library-title">Documents</h2>
        <button
          type="button"
          className="refresh-documents"
          id="refresh-documents"
          disabled={state.busy}
          onClick={actions.refresh}
        >
          Refresh
        </button>
      </div>
      <p id="document-storage-description" className="library-description">
        {state.description}
      </p>
      <label>
        Show entries
        <select
          id="document-archive-filter"
          value={state.archiveFilter}
          onChange={(e) => actions.change("archiveFilter", e.target.value)}
        >
          <option value="active">Active entries</option>
          <option value="archived">Archived entries</option>
        </select>
      </label>
      <div id="document-list">
        {!visible.length && (
          <p className="library-description">
            {archived
              ? "No archived entries."
              : "No active entries. Choose New document to create your first one."}
          </p>
        )}
        {mechanisms.map(({ key, label, entries }) => (
          <section className="document-group" key={key}>
            <div className="document-group-heading">
              <h3>{label}</h3>
              <span className="document-group-count">
                {entries.length} {entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            <ul>
              {entries.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="document-list-item"
                    data-document-id={item.id}
                    disabled={state.busy}
                    aria-current={
                      state.created && item.id === state.activeId
                        ? "true"
                        : undefined
                    }
                    onClick={async () => {
                      if (!state.created || item.id !== state.activeId)
                        await actions.open(item.id);
                      document
                        .getElementById("document-form")
                        ?.scrollIntoView({ block: "start" });
                    }}
                  >
                    <strong>{item.title}</strong>
                    <time dateTime={item.updated_at}>
                      {new Date(item.updated_at).toLocaleDateString()}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}
