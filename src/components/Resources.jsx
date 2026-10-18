// Resource cards and their search/category filters. Uses the shared item form for editing.
import { useState } from "react";

export default function Resources({ management, hidden }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const resources = management.items.filter(
    (item) =>
      item.kind === "resource" &&
      (category === "archived" ? item.archived : !item.archived) &&
      (["all", "archived"].includes(category) ||
        item.data.category === category) &&
      (item.title + " " + (item.data.notes || ""))
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  return (
    <section
      className="section resources"
      id="resources"
      hidden={hidden}
      aria-labelledby="resources-title"
    >
      <div className="section-heading">
        <div>
          <h1 id="resources-title">Resources</h1>
          <p className="section-intro">
            This is a collection of commonly used resources that'll help you
            with design.
          </p>
        </div>
        <button
          className="notebook-button primary"
          data-new="resource"
          disabled={!management.ready || management.busy}
          onClick={() => management.open("resource")}
        >
          + Add resource
        </button>
      </div>
      <div className="resource-tools">
        <label className="search-label">
          <span>Search resources</span>
          <input
            id="resource-search"
            type="search"
            placeholder="Find a part, reference, or tip…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Category
          <select
            id="resource-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All resources</option>
            <option>Part</option>
            <option>Reference</option>
            <option>Tip</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      <div id="resource-grid" className="resource-grid">
        {resources.map((item) => (
          <article className="resource-card" key={item.id}>
            <div className="panel-heading">
              <span className="tiny-label">
                {item.archived
                  ? "ARCHIVED"
                  : (item.data.category || "Reference").toUpperCase()}
              </span>
            </div>
            <h2>{item.title}</h2>
            <p>
              {item.data.notes ||
                "Add a note to help your team use this resource."}
            </p>
            <div className="resource-footer">
              {/^https?:\/\//i.test(item.data.url || "") && (
                <a
                  href={item.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open resource ↗
                </a>
              )}
              <button
                type="button"
                className="text-button"
                aria-label={"Edit " + item.title}
                onClick={() => management.open("resource", item)}
              >
                Edit
              </button>
            </div>
          </article>
        ))}
      </div>
      <p
        id="resource-empty"
        className="empty-state"
        hidden={resources.length > 0}
      >
        {management.member
          ? "Nothing here yet. Try another search, or add something useful for your team."
          : "Sign in to explore resources."}
      </p>
    </section>
  );
}
