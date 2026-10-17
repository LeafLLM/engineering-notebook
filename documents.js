// Read this file in order: editor setup -> document state -> saving -> accounts.
// script.js still owns your original tab navigation.
(() => {
    const byId = id => document.getElementById(id);
    const ui = {
        form: byId("document-form"), title: byId("entry-title"), mechanism: byId("mechanism-title"),
        save: byId("save-document"), status: byId("document-status"), list: byId("document-list"),
        create: byId("new-document"), refresh: byId("refresh-documents"),
        workspace: byId("notebook-workspace"), description: byId("document-storage-description"),
        signInForm: byId("sign-in-form"), email: byId("account-email"), password: byId("account-password"),
        signIn: byId("sign-in-button"), signInStatus: byId("sign-in-status"),
        session: byId("notebook-session"), account: byId("notebook-account"), signOut: byId("sign-out"),
        notice: byId("notebook-notice"), error: byId("notebook-error"), retry: byId("retry-notebook"),
        conflicts: byId("document-conflict-actions"), reload: byId("reload-document"), copy: byId("copy-document")
    };

    function showError(error) {
        let message = error.message || "The notebook request failed. Please try again.";
        if (["PGRST205", "42P01"].includes(error.code)) {
            message = "The shared notebook is not set up yet. Ask the project owner to finish the database setup.";
        } else if (error.code === "42501") {
            message = "Your account does not have permission for that action. Your draft has not been cleared.";
        } else if (message.includes("fetch") || message.includes("Network")) {
            message = "Could not reach the shared notebook. Check your connection and try again.";
        }
        ui.error.textContent = message;
        ui.notice.hidden = false;
    }

    if ((typeof notebookDb === "undefined" || !notebookDb) || !window.Quill) {
        ui.signIn.disabled = true;
        ui.signInStatus.textContent = "The notebook could not load.";
        showError(new Error("Check the Supabase connection settings and your internet connection, then reload this page."));
        ui.retry.addEventListener("click", () => window.location.reload());
        return;
    }

    const client = notebookDb;
    const store = createDocumentStore(client);
    const quill = new Quill("#editor", {
        theme: "snow",
        placeholder: "Start writing your document…",
        modules: { toolbar: "#editor-toolbar" },
        formats: ["header", "bold", "italic", "list", "link", "image"]
    });
    quill.root.setAttribute("role", "textbox");
    quill.root.setAttribute("aria-label", "Document content");
    quill.root.setAttribute("aria-multiline", "true");
    document.querySelector("#editor-toolbar .ql-picker-label")?.setAttribute("aria-label", "Text style");
    quill.enable(false);

    let user = null;
    let membership = null;
    let documents = [];
    let activeId = crypto.randomUUID();
    let revision = null;
    let created = false;
    let archived = false;
    let authorId = null;
    let dirty = false;
    let editVersion = 0;
    let saveTask = null;
    let saveTimer = null;
    let switching = false;
    let loadingDocument = false;
    let conflict = false;
    let sessionEpoch = 0;
    let sessionInitialized = false;
    let recoveryDraft = null;

    function status(message, state = "ready") {
        ui.status.textContent = message;
        ui.status.dataset.state = state;
    }

    function updateControls() {
        const busy = Boolean(saveTask) || switching || loadingDocument;
        ui.save.textContent = created ? "Save now" : "Create document";
        ui.save.disabled = !membership || busy || conflict || archived;
        ui.create.disabled = busy;
        ui.refresh.disabled = busy;
        ui.signOut.disabled = busy;
        ui.reload.disabled = busy;
        ui.copy.disabled = busy;
        byId("insert-template").disabled = !membership || busy || archived;
        byId("entry-image").disabled = !membership || busy || archived;
        byId("archive-document").hidden = !created || !membership || !(membership.role === "manager" || authorId === user?.id);
        byId("archive-document").disabled = busy || conflict;
        byId("archive-document").textContent = archived ? "Restore entry" : "Archive entry";
        ui.title.readOnly = switching || loadingDocument || archived;
        ui.mechanism.readOnly = switching || loadingDocument || archived;
        quill.enable(Boolean(membership) && !switching && !loadingDocument && !archived);
        for (const button of ui.list.querySelectorAll("button")) button.disabled = busy;
    }

    // Only the last-opened document ID is kept locally. Document text is in Supabase.
    function rememberDocument(id) {
        try {
            const key = "engineering-notebook.open." + membership.team_id;
            if (id) sessionStorage.setItem(key, id);
            else sessionStorage.removeItem(key);
        } catch { /* The editor also works when browser storage is unavailable. */ }
    }

    function renderDocuments() {
        window.dispatchEvent(new CustomEvent("notebook:documents", { detail: documents }));
        ui.list.replaceChildren();
        const visibleDocuments = documents.filter(item => Boolean(item.archived) === (byId("document-archive-filter").value === "archived"));
        if (!visibleDocuments.length) {
            const empty = document.createElement("p");
            empty.className = "library-description";
            empty.textContent = byId("document-archive-filter").value === "archived" ? "No archived entries." : "No active entries. Create your first one on the right.";
            ui.list.append(empty);
            return;
        }

        const groups = new Map();
        for (const item of visibleDocuments) {
            if (!groups.has(item.mechanism)) groups.set(item.mechanism, []);
            groups.get(item.mechanism).push(item);
        }
        for (const [mechanism, items] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
            const section = document.createElement("section");
            section.className = "document-group";
            const heading = document.createElement("h3");
            heading.textContent = mechanism;
            const list = document.createElement("ul");
            for (const item of items) {
                const row = document.createElement("li");
                const button = document.createElement("button");
                button.type = "button";
                button.className = "document-list-item";
                button.dataset.documentId = item.id;
                if (created && item.id === activeId) button.setAttribute("aria-current", "true");
                const title = document.createElement("strong");
                title.textContent = item.title;
                const time = document.createElement("time");
                time.dateTime = item.updated_at;
                time.textContent = new Date(item.updated_at).toLocaleDateString();
                button.append(title, time);
                row.append(button);
                list.append(row);
            }
            section.append(heading, list);
            ui.list.append(section);
        }
        updateControls();
    }

    function resetDraft() {
        clearTimeout(saveTimer);
        activeId = crypto.randomUUID();
        revision = null;
        created = false;
        archived = false;
        authorId = null;
        dirty = false;
        conflict = false;
        editVersion = 0;
        ui.title.value = "Untitled document";
        ui.mechanism.value = "";
        quill.setContents([{ insert: "\n" }], "silent");
        quill.history.clear();
        ui.conflicts.hidden = true;
        status("Draft — create the document to start saving changes.");
        updateControls();
    }

    function snapshot() {
        return {
            id: activeId, revision, team_id: membership.team_id,
            title: ui.title.value.trim() || "Untitled document",
            mechanism: ui.mechanism.value.trim() || "General",
            content: JSON.parse(JSON.stringify(quill.getContents()))
        };
    }

    function markDirty() {
        if (archived) return;
        dirty = true;
        editVersion += 1;
        clearTimeout(saveTimer);
        status(conflict ? "Your unsaved draft is still open. Reload the saved version, or save this draft as a new document."
            : created ? "Unsaved changes…" : "Draft — create the document to save it.", conflict ? "error" : "ready");
        if (created && !conflict) saveTimer = setTimeout(saveDocument, 1000);
    }

    // An existing document is UPDATED. Only the first save INSERTS a new row.
    // editVersion protects typing that happens while a network save is running.
    async function saveDocument() {
        clearTimeout(saveTimer);
        if (!membership || conflict || archived) return false;
        if (saveTask) return saveTask;
        if (created && !dirty) return true;
        const draft = snapshot();
        const versionAtStart = editVersion;
        const epochAtStart = sessionEpoch;
        status("Saving…");
        saveTask = (async () => {
            try {
                const saved = await store.save(draft, created);
                if (epochAtStart !== sessionEpoch) return false;
                activeId = saved.id;
                revision = saved.revision;
                created = true;
                archived = Boolean(saved.archived);
                authorId = saved.author_id;
                dirty = editVersion !== versionAtStart;
                documents = [saved, ...documents.filter(item => item.id !== saved.id)]
                    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
                rememberDocument(activeId);
                renderDocuments();
                ui.notice.hidden = true;
                status(dirty ? "Unsaved changes…" : "Saved to team notebook · " + new Date(saved.updated_at).toLocaleTimeString());
                if (dirty) saveTimer = setTimeout(saveDocument, 1000);
                return true;
            } catch (error) {
                if (epochAtStart !== sessionEpoch) return false;
                dirty = true;
                if (["DOCUMENT_CONFLICT", "23505"].includes(error.code)) {
                    conflict = true;
                    ui.conflicts.hidden = false;
                    status("Another saved version exists. Your draft is still open; choose how to continue.", "error");
                } else {
                    status("Save failed. Your writing is still here; try saving again.", "error");
                    showError(error);
                }
                return false;
            } finally {
                saveTask = null;
                updateControls();
            }
        })();
        updateControls();
        return saveTask;
    }

    async function finishPendingSave() {
        clearTimeout(saveTimer);
        if (saveTask && !(await saveTask)) return false;
        if (created && dirty) return saveDocument();
        return !conflict;
    }

    function showDocument(saved) {
        if (!Array.isArray(saved.content?.ops) || saved.content.ops.some(op =>
            typeof op.insert !== "string" && !(typeof op.insert?.image === "string" &&
                /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(op.insert.image)))) {
            throw new Error("This document has unsupported content. It has not been opened or overwritten.");
        }
        activeId = saved.id;
        revision = saved.revision;
        created = true;
        archived = Boolean(saved.archived);
        authorId = saved.author_id;
        dirty = false;
        conflict = false;
        editVersion = 0;
        ui.title.value = saved.title;
        ui.mechanism.value = saved.mechanism;
        quill.setContents(saved.content, "silent");
        quill.history.clear();
        ui.conflicts.hidden = true;
        ui.notice.hidden = true;
        rememberDocument(activeId);
        status(archived ? "Archived entry — restore it before editing." : "Saved to team notebook · " + new Date(saved.updated_at).toLocaleTimeString());
        renderDocuments();
        updateControls();
    }

    async function loadDocument(id) {
        const epoch = sessionEpoch;
        loadingDocument = true;
        updateControls();
        try {
            const saved = await store.open(membership.team_id, id);
            if (epoch === sessionEpoch) showDocument(saved);
        } finally {
            loadingDocument = false;
            updateControls();
        }
    }

    // Don't lose a failed save or an uncreated draft when switching documents.
    async function navigate(action) {
        if (switching) return;
        switching = true;
        updateControls();
        try {
            if (!(await finishPendingSave())) return;
            if (!created && dirty && !window.confirm("This draft has not been created. Discard it and continue?")) return;
            await action();
        } catch (error) {
            showError(error);
        } finally {
            switching = false;
            updateControls();
        }
    }

    async function applySession(session, force = false) {
        if (sessionInitialized && !force && (user?.id || null) === (session?.user?.id || null)) return;
        if (user && membership && dirty) {
            recoveryDraft = { userId: user.id, draft: snapshot(), created, archived, authorId };
        }
        const epoch = ++sessionEpoch;
        sessionInitialized = true;
        clearTimeout(saveTimer);
        user = session?.user || null;
        membership = null;
        documents = [];
        window.dispatchEvent(new CustomEvent("notebook:session", { detail: null }));
        ui.list.replaceChildren();
        ui.workspace.hidden = true;
        ui.create.hidden = true;
        ui.notice.hidden = true;
        ui.signInForm.hidden = Boolean(user);
        ui.session.hidden = !user;
        quill.enable(false);
        resetDraft();
        if (!user) {
            ui.account.textContent = "";
            ui.description.textContent = "";
            ui.signInStatus.textContent = "Use the account created for you by your team.";
            return;
        }
        ui.account.textContent = user.email + " · Loading team…";
        try {
            const member = await store.membership(user.id);
            const list = await store.list(member.team_id);
            if (epoch !== sessionEpoch) return;
            membership = member;
            documents = list;
            window.dispatchEvent(new CustomEvent("notebook:session", { detail: member }));
            ui.account.textContent = member.display_name + " · " + member.teamName;
            ui.description.textContent = "Shared with " + member.teamName + ". Refresh to see teammates' changes.";
            ui.workspace.hidden = false;
            ui.create.hidden = false;
            quill.enable(true);
            if (recoveryDraft?.userId === user.id) {
                const recovered = recoveryDraft;
                recoveryDraft = null;
                activeId = recovered.draft.id;
                revision = recovered.draft.revision;
                created = recovered.created;
                archived = recovered.archived;
                authorId = recovered.authorId;
                ui.title.value = recovered.draft.title;
                ui.mechanism.value = recovered.draft.mechanism;
                quill.setContents(recovered.draft.content, "silent");
                markDirty();
            } else {
                let lastId;
                try { lastId = sessionStorage.getItem("engineering-notebook.open." + member.team_id); } catch { /* Optional navigation state. */ }
                if (list.some(item => item.id === lastId)) await loadDocument(lastId);
            }
            renderDocuments();
            updateControls();
        } catch (error) {
            if (epoch === sessionEpoch) {
                ui.account.textContent = user.email;
                showError(error);
            }
        }
    }

    quill.on("text-change", (_change, _previous, source) => {
        if (source === "user") markDirty();
    });
    ui.title.addEventListener("input", markDirty);
    // Insert prompts at the cursor; never replace existing writing.
    function insertPrompts() {
        if (!membership || archived) return;
        const index = quill.getSelection()?.index ?? Math.max(0, quill.getLength() - 1);
        const prompts = "\nDate & time: " + new Date().toLocaleString() + "\n\nProblem\nWhat are we trying to improve?\n\nConstraints\nWhat limits our design?\n\nResearch & examples\nWhat have we learned from other designs?\n\nDesign changes & reasoning\nWhat changed, and why?\n\nTesting & evidence\nWhat did we observe? Add screenshots, measurements, or a video link.\n\nNext steps\nWhat should we try next?\n";
        // Navigation temporarily disables typing. API insertion still works,
        // and we explicitly mark the inserted template as an unsaved edit.
        quill.insertText(index, prompts, "api");
        markDirty();
        quill.setSelection(index + prompts.length, 0);
    }
    byId("insert-template").addEventListener("click", insertPrompts);
    byId("entry-image").addEventListener("change", async event => {
        const file = event.target.files[0];
        if (!file || !membership || archived) return;
        const epoch = sessionEpoch;
        const documentId = activeId;
        const index = quill.getSelection()?.index ?? Math.max(0, quill.getLength() - 1);
        try {
            if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1024 * 1024) {
                throw new Error("Choose a PNG, JPG, or WebP image no larger than 1 MB.");
            }
            const data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error("The image could not be read."));
                reader.readAsDataURL(file);
            });
            if (epoch !== sessionEpoch || documentId !== activeId) return;
            quill.insertEmbed(index, "image", data, "user");
            quill.setSelection(index + 1, 0);
        } catch (error) { showError(error); }
        finally { event.target.value = ""; }
    });
    window.addEventListener("notebook:new-entry", () => navigate(() => {
        if (!membership) return;
        location.hash = "documenting";
        resetDraft();
        rememberDocument(null);
        insertPrompts();
        renderDocuments();
        ui.title.focus();
        ui.title.select();
    }));
    window.addEventListener("notebook:open-entry", event => navigate(async () => {
        if (!membership) return;
        location.hash = "documenting";
        await loadDocument(event.detail);
    }));
    ui.mechanism.addEventListener("input", markDirty);
    byId("document-archive-filter").addEventListener("change", renderDocuments);
    byId("archive-document").addEventListener("click", () => navigate(async () => {
        if (!created || !membership || !(membership.role === "manager" || authorId === user?.id)) return;
        const epoch = sessionEpoch;
        const saved = await store.archive(membership.team_id, activeId, revision, !archived);
        if (epoch !== sessionEpoch) return;
        documents = [saved, ...documents.filter(item => item.id !== saved.id)];
        byId("document-archive-filter").value = saved.archived ? "archived" : "active";
        showDocument(saved);
    }));
    ui.form.addEventListener("submit", async event => {
        event.preventDefault();
        await saveDocument();
    });
    ui.form.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            saveDocument();
        }
    });
    ui.create.addEventListener("click", () => navigate(() => {
        byId("document-archive-filter").value = "active";
        resetDraft();
        rememberDocument(null);
        insertPrompts();
        renderDocuments();
        ui.title.focus();
        ui.title.select();
    }));
    ui.list.addEventListener("click", event => {
        const button = event.target.closest("button[data-document-id]");
        if (button && (!created || button.dataset.documentId !== activeId)) {
            navigate(() => loadDocument(button.dataset.documentId));
        }
    });
    ui.refresh.addEventListener("click", async () => {
        if (switching) return;
        switching = true;
        updateControls();
        const epoch = sessionEpoch;
        try {
            if (!(await finishPendingSave())) return;
            const list = await store.list(membership.team_id);
            if (epoch !== sessionEpoch) return;
            documents = list;
            if (created) await loadDocument(activeId);
            renderDocuments();
        } catch (error) { showError(error); }
        finally { switching = false; updateControls(); }
    });
    ui.reload.addEventListener("click", async () => {
        if (!window.confirm("Reload the saved version? This will replace the unsaved draft currently on this page.")) return;
        try { await loadDocument(activeId); } catch (error) { showError(error); }
    });
    ui.copy.addEventListener("click", async () => {
        conflict = false;
        created = false;
        archived = false;
        authorId = null;
        revision = null;
        activeId = crypto.randomUUID();
        ui.title.value = (ui.title.value.trim() || "Untitled document") + " (copy)";
        ui.conflicts.hidden = true;
        markDirty();
        await saveDocument();
    });
    ui.signInForm.addEventListener("submit", async event => {
        event.preventDefault();
        ui.signIn.disabled = true;
        ui.signInStatus.textContent = "Signing in…";
        try {
            const { data, error } = await client.auth.signInWithPassword({
                email: ui.email.value.trim(), password: ui.password.value
            });
            if (error) throw error;
            ui.password.value = "";
            await applySession(data.session);
        } catch (error) {
            ui.signInStatus.textContent = error.message || "Could not sign in. Please try again.";
        } finally { ui.signIn.disabled = false; }
    });
    ui.signOut.addEventListener("click", () => navigate(async () => {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
        dirty = false;
        recoveryDraft = null;
        await applySession(null);
    }));
    ui.retry.addEventListener("click", () => {
        if (user) applySession({ user }, true);
        else window.location.reload();
    });
    window.addEventListener("beforeunload", event => {
        if (dirty || saveTask) {
            event.preventDefault();
            event.returnValue = "";
        }
    });

    // Keep this callback synchronous; do Supabase requests after it returns.
    client.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => applySession(session), 0);
    });
    client.auth.getSession().then(({ data, error }) => {
        if (error) showError(error);
        else applySession(data.session);
    }).catch(showError);
})();
