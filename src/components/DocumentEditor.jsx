// Title, mechanism, save buttons, and rich-text editor. Saving itself lives in the notebook controller.
export default function DocumentEditor({
  state,
  actions,
  editorRef,
  toolbarRef,
  titleRef,
}) {
  return (
    <form
      id="document-form"
      className="document-workspace"
      onSubmit={actions.submit}
      onKeyDown={actions.keydown}
    >
      <div className="document-topbar">
        <div className="document-heading-fields">
          <label htmlFor="entry-title" className="visually-hidden">
            Document title
          </label>
          <input
            ref={titleRef}
            type="text"
            id="entry-title"
            name="title"
            autoComplete="off"
            value={state.title}
            readOnly={state.locked}
            onChange={(e) => actions.edit("title", e.target.value)}
          />
          <label htmlFor="mechanism-title" className="document-mechanism">
            <span>Mechanism</span>
            <input
              type="text"
              id="mechanism-title"
              name="mechanism-title"
              placeholder="General"
              autoComplete="off"
              value={state.mechanism}
              readOnly={state.locked}
              onChange={(e) => actions.edit("mechanism", e.target.value)}
            />
          </label>
        </div>
        <button
          type="submit"
          className="notebook-button primary"
          id="save-document"
          disabled={
            !state.membership || state.busy || state.conflict || state.archived
          }
        >
          {state.created ? "Save now" : "Create document"}
        </button>
      </div>
      <div className="entry-actions">
        <button
          type="button"
          className="text-button"
          id="archive-document"
          hidden={!state.canArchive}
          disabled={state.busy || state.conflict}
          onClick={actions.archive}
        >
          {state.archived ? "Restore entry" : "Archive entry"}
        </button>
        {state.archived && state.canArchive && (
          <button
            type="button"
            className="text-button danger"
            id="delete-document"
            disabled={state.busy || state.conflict}
            onClick={actions.remove}
          >
            Delete permanently
          </button>
        )}
      </div>
      <p
        id="document-status"
        className="document-status"
        role="status"
        aria-live="polite"
        data-state={state.statusState}
      >
        {state.status}
      </p>
      <div
        className="document-conflict-actions"
        id="document-conflict-actions"
        hidden={state.conflictsHidden}
      >
        <button
          type="button"
          className="notebook-button"
          id="reload-document"
          disabled={state.busy}
          onClick={actions.reload}
        >
          Reload saved version
        </button>
        <button
          type="button"
          className="notebook-button"
          id="copy-document"
          disabled={state.busy}
          onClick={actions.copy}
        >
          Save draft as new document
        </button>
      </div>
      <div className="editor-extras">
        <button
          type="button"
          id="insert-template"
          className="text-button"
          disabled={!state.membership || state.busy || state.archived}
          onClick={actions.prompts}
        >
          Insert design prompts
        </button>
        <label className="image-upload">
          + Add image
          <input
            id="entry-image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            disabled={!state.membership || state.busy || state.archived}
            onChange={actions.image}
          />
        </label>
        <span>PNG, JPG or WebP · up to 1 MB</span>
      </div>
      <EditorToolbar toolbarRef={toolbarRef} />
      <div className="document-paper">
        <div id="editor" ref={editorRef} />
      </div>
    </form>
  );
}

// Quill owns the DOM inside the toolbar and editor. React owns their containers.
function EditorToolbar({ toolbarRef }) {
  return (
    <div id="editor-toolbar" ref={toolbarRef} aria-label="Document formatting">
      <span className="ql-formats">
        <select className="ql-header" aria-label="Text style" defaultValue="">
          <option value="">Normal text</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
        </select>
      </span>
      <span className="ql-formats">
        <button
          type="button"
          className="ql-bold"
          aria-label="Bold"
          title="Bold"
        />
        <button
          type="button"
          className="ql-italic"
          aria-label="Italic"
          title="Italic"
        />
        <button
          type="button"
          className="ql-link"
          aria-label="Insert link"
          title="Insert link"
        />
      </span>
      <span className="ql-formats">
        <button
          type="button"
          className="ql-list"
          value="ordered"
          aria-label="Numbered list"
          title="Numbered list"
        />
        <button
          type="button"
          className="ql-list"
          value="bullet"
          aria-label="Bulleted list"
          title="Bulleted list"
        />
      </span>
    </div>
  );
}
