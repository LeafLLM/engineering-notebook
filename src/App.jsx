// Page layout and navigation. Connects the notebook and team tools through props.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNotebook } from "./hooks/useNotebook";
import { useManagement } from "./hooks/useManagement";
import AccountPanel from "./components/AccountPanel";
import DocumentList from "./components/DocumentList";
import DocumentEditor from "./components/DocumentEditor";
import Overview, { byDue, dueLabel } from "./components/Overview";
import Deadlines from "./components/Deadlines";
import Resources from "./components/Resources";
import ItemDialog from "./components/ItemDialog";

const tabs = ["overview", "documenting", "resources"];
const currentTab = () =>
  tabs.includes(location.hash.slice(1)) ? location.hash.slice(1) : "overview";

export default function App() {
  // Hooks own the data; components receive only the state and actions they need.
  const notebook = useNotebook();
  const { state, actions } = notebook;
  const management = useManagement(state.membership);
  const [tab, setTab] = useState(currentTab);
  const navigationFrame = useRef(null);
  const showTab = useCallback((id) => {
    setTab(id);
    cancelAnimationFrame(navigationFrame.current);
    // Wait for React to reveal the section before scrolling to it. The account
    // form can fill a phone screen, so resetting to the page top hides the result.
    navigationFrame.current = requestAnimationFrame(() => {
      const section = document.getElementById(id);
      if (!section) return;
      const navHeight =
        document.querySelector(".navbar")?.getBoundingClientRect().height || 0;
      window.scrollTo({
        top: Math.max(
          0,
          window.scrollY + section.getBoundingClientRect().top - navHeight - 16,
        ),
        behavior: "auto",
      });
    });
  }, []);
  // Hash links preserve reloads, direct links, and the browser Back button.
  useEffect(() => {
    const change = () => {
      showTab(currentTab());
    };
    window.addEventListener("hashchange", change);
    return () => {
      window.removeEventListener("hashchange", change);
      cancelAnimationFrame(navigationFrame.current);
    };
  }, [showTab]);
  const next = management.items
    .filter(
      (item) =>
        item.kind === "task" &&
        !item.archived &&
        item.data.status !== "Done" &&
        item.data.due &&
        item.data.assignee === state.membership?.user_id,
    )
    .sort(byDue)[0];
  return (
    <>
      <div className="main">
        <header className="app-header">
          <a
            className="brand"
            href="#overview"
            aria-label="CAD Notebook overview"
          >
            <span>CAD Notebook</span>
          </a>
          <div className="management-label" />
        </header>
        <nav className="navbar" aria-label="Main navigation">
          {tabs.map((id) => (
            <a
              href={"#" + id}
              key={id}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                showTab(id);
                if (location.hash !== "#" + id) location.hash = id;
              }}
              aria-current={tab === id ? "page" : undefined}
            >
              {id[0].toUpperCase() + id.slice(1)}
            </a>
          ))}
        </nav>
        <AccountPanel state={state} actions={actions} />
        <p
          id="management-status"
          role="status"
          aria-live="polite"
          className={management.error ? "error" : undefined}
        >
          {management.message}
        </p>
        <div className="page">
          <Overview
            key={state.membership?.user_id || "signed-out"}
            management={management}
            documents={state.documents}
            notebookActions={actions}
            hidden={tab !== "overview"}
          />
          <Deadlines
            key={"deadlines-" + (state.membership?.user_id || "")}
            management={management}
            notebookActions={actions}
          />
          <div
            className="section documenting"
            id="documenting"
            hidden={tab !== "documenting"}
          >
            <div className="notebook-heading">
              <div>
                <h1>Documenting</h1>
              </div>
              <button
                type="button"
                className="notebook-button"
                id="new-document"
                hidden={state.createHidden}
                disabled={state.busy}
                onClick={actions.create}
              >
                New document
              </button>
            </div>
            <div
              className="notebook-layout"
              id="notebook-workspace"
              hidden={state.workspaceHidden}
            >
              <DocumentList state={state} actions={actions} />
              <DocumentEditor {...notebook} />
            </div>
          </div>
          <Resources
            key={"resources-" + (state.membership?.user_id || "")}
            management={management}
            hidden={tab !== "resources"}
          />
        </div>
        <footer id="next-task" className="next-task">
          <span className="next-dot" aria-hidden="true" />
          <strong>NEXT UP</strong>
          <span id="next-task-text">
            {next
              ? next.title + " · " + dueLabel(next.data.due)
              : state.membership
                ? "You're clear of assigned deadlines. Check the team timeline for the next step."
                : "A clear next step makes a difference."}
          </span>
        </footer>
      </div>
      {management.editing && (
        <ItemDialog key={management.editing.id} management={management} />
      )}
    </>
  );
}
