// Tab navigation for Overview / Documenting / Resources.
// The URL hash (#overview, #documenting, #resources) decides which section is
// visible, so Back/Forward, reloads, and links like "Open notebook" all work.
(() => {
    // The nav links are the source of truth: add a link + a section with the
    // matching id in index.html and this file needs no changes.
    const links = [...document.querySelectorAll(".navbar a[href^='#']")];
    const sectionIds = links.map(link => link.getAttribute("href").slice(1));
    const fallback = sectionIds[0]; // Overview

    // "#documenting" -> "documenting". Unknown or empty hashes fall back to Overview.
    function currentId() {
        const id = location.hash.slice(1);
        return sectionIds.includes(id) ? id : fallback;
    }

    // Show exactly one section and mark its nav link as the current page.
    // style.css highlights the link through the aria-current attribute.
    function showSection() {
        const active = currentId();
        for (const id of sectionIds) {
            document.getElementById(id).hidden = id !== active;
        }
        for (const link of links) {
            if (link.getAttribute("href") === "#" + active) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
        }
    }

    // Fires whenever the hash changes: a nav click, the brand link, the
    // "Open notebook" link, documents.js setting location.hash, or Back/Forward.
    window.addEventListener("hashchange", () => {
        showSection();
        window.scrollTo(0, 0); // Start each section at its top.
    });

    showSection(); // Apply the hash that was in the URL when the page loaded.
})();