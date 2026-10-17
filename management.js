// Read in order: state -> rendering -> loading -> forms -> event listeners.
// documents.js owns authentication and announces the signed-in membership.
(() => {
    const $ = id => document.getElementById(id);
    const client = notebookDb;
    const store = client && createManagementStore(client);
    let member = null;
    let members = [];
    let items = [];
    let documents = [];
    let epoch = 0; // Prevent an old request from displaying data after sign-out.
    let busy = false;
    let ready = false;
    let editing = null;
    let formDirty = false;
    let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let selectedDay = "";
    const dialog = $("item-dialog");
    const form = $("item-form");
    const isManager = () => member?.role === "manager";
    const canEditTask = task => Boolean(member && (isManager() || task?.data.assignee === member.user_id));

    // User text goes through textContent, never through HTML interpolation.
    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    }
    function button(text, action, className = "text-button") {
        const node = element("button", text, className);
        node.type = "button";
        node.addEventListener("click", action);
        return node;
    }
    function nameFor(id) {
        return members.find(person => person.user_id === id)?.display_name || "Unassigned";
    }
    function dueLabel(value) {
        if (!value) return "No date";
        const date = new Date(value + "T12:00:00");
        return Number.isNaN(date.getTime()) ? "No date" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    function isOverdue(task) {
        return task.data.due && task.data.status !== "Done" && new Date(task.data.due + "T23:59:59") < new Date();
    }
    function byDue(a, b) {
        return (a.data.due || "9999").localeCompare(b.data.due || "9999");
    }
    function tasks() { return items.filter(item => item.kind === "task"); }
    function notice(text, error = false) {
        $("management-status").textContent = text;
        $("management-status").classList.toggle("error", error);
    }
    function controls() {
        document.querySelectorAll("[data-new]").forEach(node => {
            node.hidden = node.dataset.new === "task" && !isManager();
            node.disabled = !ready || busy;
        });
        document.querySelectorAll("[data-start-entry]").forEach(node => node.disabled = !member);
        $("refresh-management").disabled = !member || busy;
        $("save-item").disabled = busy;
        $("archive-item").disabled = busy;
        $("cancel-item").disabled = busy;
        $("close-item-dialog").disabled = busy;
    }
    function renderTasks() {
        const status = $("task-status-filter").value;
        const assignee = $("task-assignee-filter").value;
        const visible = tasks().filter(item => {
            if (selectedDay && item.data.due !== selectedDay) return false;
            if (status === "archived" ? !item.archived : item.archived) return false;
            if (assignee !== "all" && item.data.assignee !== assignee) return false;
            return status === "active" ? item.data.status !== "Done" : status === "Done" ? item.data.status === "Done" : true;
        }).sort(byDue);
        $("task-table-body").replaceChildren();
        for (const task of visible) {
            const row = element("tr");
            const titleCell = element("td");
            titleCell.append(element("strong", task.title), element("small", task.data.mechanism || "General"));
            const date = element("td", dueLabel(task.data.due), isOverdue(task) ? "overdue" : "");
            const statusCell = element("td");
            statusCell.append(element("span", task.archived ? "Archived" : task.data.status, "status-pill " + (task.data.status === "Done" ? "done" : task.data.status === "In progress" ? "progress" : "todo")));
            const action = element("td");
            const edit = button("Edit", () => openForm("task", task));
            edit.setAttribute("aria-label", "Edit " + task.title);
            if (canEditTask(task)) action.append(edit);
            row.append(titleCell, element("td", nameFor(task.data.assignee)), date, statusCell, action);
            $("task-table-body").append(row);
        }
        $("task-empty").hidden = visible.length > 0;
        $("task-empty").textContent = member ? "No tasks match this view. Try changing the filters." : "Sign in to see your team's plan.";
        const active = tasks().filter(task => !task.archived && task.data.status !== "Done");
        $("stat-open").textContent = member ? active.length : "—";
        $("stat-progress").textContent = member ? active.filter(task => task.data.status === "In progress").length : "—";
        renderDeadlines(active);
        renderCalendar();
    }
    function dateKey(date) {
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    }
    function renderCalendar() {
        $("calendar-month").textContent = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        $("calendar-days").replaceChildren();
        const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1 - calendarMonth.getDay());
        for (let offset = 0; offset < 42; offset++) {
            const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset);
            const key = dateKey(day);
            const due = tasks().filter(task => !task.archived && task.data.due === key);
            const cell = button(String(day.getDate()), () => { selectedDay = key; renderTasks(); }, "calendar-day");
            cell.classList.toggle("outside-month", day.getMonth() !== calendarMonth.getMonth());
            cell.classList.toggle("today", key === dateKey(new Date()));
            cell.setAttribute("aria-pressed", String(key === selectedDay));
            cell.setAttribute("aria-label", day.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) + ": " + due.length + " tasks");
            if (due.length) {
                cell.classList.add("has-tasks");
                cell.title = due.map(task => task.title).join("; ");
            }
            $("calendar-days").append(cell);
        }
        $("clear-calendar-day").hidden = !selectedDay;
        $("clear-calendar-day").textContent = selectedDay ? "Showing " + dueLabel(selectedDay) + " · Show all dates ×" : "Show all dates";
    }
    function renderDeadlines(active) {
        const assignee = $("deadline-assignee").value;
        const upcoming = active.filter(task => task.data.due && (assignee === "all" || task.data.assignee === assignee)).sort(byDue);
        $("deadline-list").replaceChildren();
        for (const task of upcoming.slice(0, 5)) {
            const node = button("", () => openForm("task", task), "deadline-item");
            node.disabled = !canEditTask(task);
            node.append(element("span", (isOverdue(task) ? "OVERDUE · " : "") + dueLabel(task.data.due), isOverdue(task) ? "overdue" : "deadline-date"), element("strong", task.title), element("small", nameFor(task.data.assignee)));
            $("deadline-list").append(node);
        }
        if (!upcoming.length) $("deadline-list").append(element("p", member ? "No deadlines in this view. Room to focus." : "Sign in to see upcoming tasks.", "empty-state"));
        const mine = active.filter(task => task.data.assignee === member?.user_id && task.data.due).sort(byDue)[0];
        $("next-task-text").textContent = mine ? mine.title + " · " + dueLabel(mine.data.due) : member ? "You're clear of assigned deadlines. Check the team timeline for the next step." : "A clear next step makes a difference.";
    }
    function renderResources() {
        const search = $("resource-search").value.toLowerCase().trim();
        const category = $("resource-category").value;
        const resources = items.filter(item => item.kind === "resource" &&
            (category === "archived" ? item.archived : !item.archived) &&
            (["all", "archived"].includes(category) || item.data.category === category) &&
            (item.title + " " + (item.data.notes || "")).toLowerCase().includes(search));
        $("resource-grid").replaceChildren();
        for (const resource of resources) {
            const card = element("article", undefined, "resource-card");
            const header = element("div", undefined, "panel-heading");
            const category = resource.data.category || "Reference";
            header.append(element("span", category === "Part" ? "⬡" : category === "Tip" ? "✳" : "↗", "resource-symbol"), element("span", resource.archived ? "ARCHIVED" : category.toUpperCase(), "tiny-label"));
            card.append(header, element("h2", resource.title), element("p", resource.data.notes || "Add a note to help your team use this resource."));
            const footer = element("div", undefined, "resource-footer");
            if (/^https?:\/\//i.test(resource.data.url || "")) {
                const link = element("a", "Open resource ↗");
                link.href = resource.data.url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                footer.append(link);
            }
            const edit = button("Edit", () => openForm("resource", resource));
            edit.setAttribute("aria-label", "Edit " + resource.title);
            footer.append(edit);
            card.append(footer);
            $("resource-grid").append(card);
        }
        $("resource-empty").hidden = resources.length > 0;
        $("resource-empty").textContent = member ? "Nothing here yet. Try another search, or add something useful for your team." : "Sign in to explore resources.";
    }
    function renderDocuments() {
        const activeDocuments = documents.filter(item => !item.archived);
        $("stat-documents").textContent = member ? activeDocuments.length : "—";
        $("recent-documents").replaceChildren();
        for (const item of activeDocuments.slice(0, 3)) {
            const open = button("", () => window.dispatchEvent(new CustomEvent("notebook:open-entry", { detail: item.id })), "recent-entry");
            open.append(element("span", "≡", "entry-symbol"), element("strong", item.title), element("small", item.mechanism + " · " + new Date(item.updated_at).toLocaleDateString()));
            $("recent-documents").append(open);
        }
        if (!activeDocuments.length) $("recent-documents").append(element("p", "Your design decisions will appear here.", "empty-state"));
    }
    function renderMembers() {
        for (const id of ["task-assignee-filter", "deadline-assignee", "item-assignee"]) {
            const select = $(id);
            const previous = select.value;
            select.replaceChildren(new Option(id === "item-assignee" ? "Unassigned" : "Everyone", id === "item-assignee" ? "" : "all"));
            if (id !== "item-assignee") select.add(new Option("Unassigned", ""));
            for (const person of members) select.add(new Option(person.display_name, person.user_id));
            if ([...select.options].some(option => option.value === previous)) select.value = previous;
        }
        $("team-roster").replaceChildren();
        for (const person of members) {
            const row = element("div", undefined, "roster-person");
            row.append(element("span", person.display_name.slice(0, 1), "member-avatar"), element("span", person.display_name));
            $("team-roster").append(row);
        }
    }
    function render() { renderTasks(); renderResources(); renderDocuments(); controls(); }

    async function refresh() {
        if (!member || !store || busy) return;
        const requestEpoch = epoch;
        busy = true;
        controls();
        notice("Loading your team's plan…");
        try {
            const [people, records] = await Promise.all([store.members(member.team_id), store.list(member.team_id)]);
            if (requestEpoch !== epoch) return;
            members = people;
            const currentMember = members.find(person => person.user_id === member.user_id);
            if (!currentMember) throw new Error("Your team membership changed. Sign out and sign in again.");
            member = { ...member, role: currentMember.role };
            $("workspace-mode").textContent = isManager() ? "MANAGER" : "MEMBER";
            items = records;
            ready = true;
            renderMembers();
            notice("Team plan refreshed. Refresh again to see teammates' latest changes.");
        } catch (error) {
            if (requestEpoch !== epoch) return;
            notice(["PGRST205", "42P01"].includes(error.code) ? "Tasks and resources aren't set up yet. Ask the project owner to finish management setup. Your notebook is still available." : error.message, true);
        } finally {
            if (requestEpoch === epoch) { busy = false; render(); }
        }
    }

    function openForm(kind, item) {
        if (!ready || busy) return;
        if (kind === "task" && (item ? !canEditTask(item) : !isManager())) return;
        editing = item ? structuredClone(item) : { id: crypto.randomUUID(), kind, team_id: member.team_id, data: {} };
        form.reset();
        formDirty = false;
        $("item-dialog-title").textContent = (item ? "Edit " : "Add ") + kind;
        $("save-item").textContent = "Save " + kind;
        $("item-error").textContent = "";
        $("task-fields").hidden = $("task-fields").disabled = kind !== "task";
        $("resource-fields").hidden = $("resource-fields").disabled = kind !== "resource";
        $("item-title").value = item?.title || "";
        $("item-mechanism").value = item?.data.mechanism || "";
        $("item-assignee").value = item?.data.assignee || "";
        $("task-assignment-field").hidden = !isManager();
        $("item-due").value = item?.data.due || "";
        $("item-status").value = item?.data.status || "To do";
        $("item-category").value = item?.data.category || "Part";
        $("item-url").value = item?.data.url || "";
        $("item-notes").value = item?.data.notes || "";
        $("archive-item").hidden = !item;
        $("archive-item").textContent = item?.archived ? "Restore" : "Archive";
        dialog.showModal();
        $("item-title").focus();
    }
    function closeForm() {
        if (busy || (formDirty && !confirm("Discard the unsaved changes in this form?"))) return;
        dialog.close();
        editing = null;
        formDirty = false;
    }
    async function saveItem(record) {
        if (busy || !member) return;
        if (record.kind === "task" && (record.revision ? !canEditTask(editing) : !isManager())) return;
        const requestEpoch = epoch;
        busy = true;
        controls();
        $("item-error").textContent = "Saving…";
        // Freeze the form so edits made during this save cannot be lost.
        for (const node of form.querySelectorAll("input, textarea, select")) node.disabled = true;
        try {
            const saved = await store.save(record);
            if (requestEpoch !== epoch) return;
            items = [saved, ...items.filter(item => item.id !== saved.id)];
            formDirty = false;
            dialog.close();
            editing = null;
            notice("Saved to your team.");
        } catch (error) {
            if (requestEpoch === epoch) $("item-error").textContent = error.message || "Could not save. Your form has been kept open.";
        } finally {
            for (const node of form.querySelectorAll("input, textarea, select")) node.disabled = false;
            if (requestEpoch === epoch) { busy = false; render(); }
        }
    }
    form.addEventListener("submit", event => {
        event.preventDefault();
        if (!editing || busy) return;
        const title = $("item-title").value.trim();
        if (!title) { $("item-error").textContent = "Give this item a title."; return; }
        const data = { notes: $("item-notes").value.trim() };
        if (editing.kind === "task") Object.assign(data, { mechanism: $("item-mechanism").value.trim() || "General", assignee: isManager() ? $("item-assignee").value : editing.data.assignee, due: $("item-due").value, status: $("item-status").value });
        else {
            data.category = $("item-category").value;
            data.url = $("item-url").value.trim();
            if (data.url && !/^https?:\/\//i.test(data.url)) { $("item-error").textContent = "Use a link beginning with https:// or http://."; return; }
        }
        saveItem({ ...editing, title, data });
    });
    $("archive-item").addEventListener("click", () => {
        if (formDirty) { $("item-error").textContent = "Save your edits before archiving or restoring this item."; return; }
        saveItem({ ...editing, archived: !editing.archived });
    });
    form.addEventListener("input", () => { formDirty = true; });
    form.addEventListener("change", () => { formDirty = true; });
    dialog.addEventListener("cancel", event => { event.preventDefault(); closeForm(); });
    $("close-item-dialog").addEventListener("click", closeForm);
    $("cancel-item").addEventListener("click", closeForm);
    document.querySelectorAll("[data-new]").forEach(node => node.addEventListener("click", () => openForm(node.dataset.new)));
    document.querySelectorAll("[data-start-entry]").forEach(node => node.addEventListener("click", () => window.dispatchEvent(new Event("notebook:new-entry"))));
    for (const id of ["task-assignee-filter", "task-status-filter", "deadline-assignee"]) $(id).addEventListener("change", renderTasks);
    $("resource-search").addEventListener("input", renderResources);
    $("resource-category").addEventListener("change", renderResources);
    $("refresh-management").addEventListener("click", refresh);
    $("calendar-previous").addEventListener("click", () => { calendarMonth.setMonth(calendarMonth.getMonth() - 1); selectedDay = ""; renderTasks(); });
    $("calendar-next").addEventListener("click", () => { calendarMonth.setMonth(calendarMonth.getMonth() + 1); selectedDay = ""; renderTasks(); });
    $("calendar-today").addEventListener("click", () => { calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); selectedDay = ""; renderTasks(); });
    $("clear-calendar-day").addEventListener("click", () => { selectedDay = ""; renderTasks(); });
    window.addEventListener("notebook:documents", event => { documents = event.detail; renderDocuments(); });
    window.addEventListener("notebook:session", event => {
        ++epoch;
        member = event.detail;
        selectedDay = "";
        members = []; items = []; documents = []; ready = false; busy = false;
        dialog.close(); editing = null; formDirty = false;
        $("team-name").textContent = member?.teamName || "Team workspace";
        $("workspace-mode").textContent = member ? (isManager() ? "MANAGER" : "MEMBER") : "Shared workspace";
        notice(""); renderMembers(); render();
        if (member) refresh();
    });
    window.addEventListener("beforeunload", event => {
        if (formDirty || busy && editing) { event.preventDefault(); event.returnValue = ""; }
    });
    renderMembers();
    render();
})();
