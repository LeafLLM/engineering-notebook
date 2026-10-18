// Resource cards and their search/category filters. Uses the shared item form for editing.
import { useEffect, useRef, useState } from "react";

function ResourceDetails({ item, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="resource-details"
      aria-labelledby="resource-details-title"
      onClose={onClose}
    >
      <div className="panel-heading">
        <span className="tiny-label">{item.data.category || "Reference"}</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Close resource"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <h2 id="resource-details-title">{item.title}</h2>
      <p className="resource-details-notes">{item.data.notes}</p>
      <div className="resource-pictures">
        {(item.data.images || []).map(
          (image, index) =>
            /^data:image\/(png|jpeg|webp);base64,/i.test(image.src || "") && (
              <img
                key={index}
                src={image.src}
                alt={image.name || `${item.title} picture ${index + 1}`}
              />
            ),
        )}
      </div>
      {/^https?:\/\//i.test(item.data.url || "") && (
        <a href={item.data.url} target="_blank" rel="noopener noreferrer">
          Open resource ↗
        </a>
      )}
    </dialog>
  );
}

export default function Resources({ management, hidden }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  useEffect(() => {
    if (hidden) setExpandedId(null);
  }, [hidden]);
  const expanded =
    !hidden && management.items.find((item) => item.id === expandedId);
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
            <button
              type="button"
              className="resource-expand"
              aria-label={`Expand ${item.title}`}
              onClick={() => setExpandedId(item.id)}
            >
              <span className="visually-hidden">View full resource</span>
            </button>
            <div className="panel-heading">
              <span className="tiny-label">
                {item.archived
                  ? "ARCHIVED"
                  : (item.data.category || "Reference").toUpperCase()}
              </span>
            </div>
            <h2>{item.title}</h2>
            {item.data.images?.length > 0 && (
              <div className="resource-pictures">
                {item.data.images.map(
                  (image, index) =>
                    /^(data:image\/(png|jpeg|webp);base64,)/i.test(
                      image.src || "",
                    ) && (
                      <img
                        key={index}
                        src={image.src}
                        alt={image.name || `${item.title} picture ${index + 1}`}
                        loading="lazy"
                      />
                    ),
                )}
              </div>
            )}
            <p className="resource-summary">
              {item.data.notes ||
                "Add a note to help your team use this resource."}
            </p>
            <span className="resource-expand-hint">Click to expand</span>
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
      {expanded && (
        <ResourceDetails item={expanded} onClose={() => setExpandedId(null)} />
      )}
    </section>
  );
}
